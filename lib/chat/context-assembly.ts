import {
  getClientById,
  getClientSessionCount,
  getLatestDocumentByType,
  getRecentClinicalNotesByClient,
} from "@/lib/db/queries";
import type { ClinicalNoteWithSession } from "@/lib/db/types";
import type { ClinicalDocumentType } from "@/lib/documents/types";

/** Maximum number of recent session notes to include in chat context */
export const MAX_RECENT_NOTES = 10;

/** Maximum total characters for the assembled context block (safety valve) */
export const MAX_CONTEXT_CHARS = 30_000;

/**
 * Document types considered as "summary documents" for Tier 2, in priority order.
 * case_formulation is preferred as it is the most clinically synthesised view.
 */
export const SUMMARY_DOCUMENT_TYPES: ClinicalDocumentType[] = [
  "case_formulation",
  "comprehensive_assessment",
];

// ── Private helpers ──────────────────────────────────────────────────────────

function formatNoteContent(note: ClinicalNoteWithSession): string {
  const content = note.content;

  // Each check uses the unique discriminator key for that format.
  // subjective   → SOAP
  // data         → DAP  (no other type has `data`)
  // behaviour    → BIRP
  // goals        → GIRP
  // clinicalOpening → Narrative
  // body         → Freeform fallback

  if ("subjective" in content) {
    return [
      `Subjective: ${content.subjective}`,
      `Objective: ${content.objective}`,
      `Assessment: ${content.assessment}`,
      `Plan: ${content.plan}`,
    ].join("\n");
  }

  if ("data" in content) {
    return [
      `Data: ${content.data}`,
      `Assessment: ${content.assessment}`,
      `Plan: ${content.plan}`,
    ].join("\n");
  }

  if ("behaviour" in content) {
    return [
      `Behaviour: ${content.behaviour}`,
      `Intervention: ${content.intervention}`,
      `Response: ${content.response}`,
      `Plan: ${content.plan}`,
    ].join("\n");
  }

  if ("goals" in content) {
    return [
      `Goals: ${content.goals}`,
      `Intervention: ${content.intervention}`,
      `Response: ${content.response}`,
      `Plan: ${content.plan}`,
    ].join("\n");
  }

  if ("clinicalOpening" in content) {
    return [
      content.clinicalOpening,
      content.sessionBody,
      content.clinicalSynthesis,
      content.pathForward,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  // Freeform fallback
  if ("body" in content) {
    return content.body;
  }

  return "";
}

// ── Token estimation ─────────────────────────────────────────────────────────

/**
 * Rough token estimate: 1 token ≈ 4 characters for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type TruncationStrategy =
  | "none"
  | "reduced_notes"
  | "minimal_notes"
  | "truncated_notes";

// ── Main export ──────────────────────────────────────────────────────────────

export async function assembleChatClientContext({
  clientId,
  therapistId,
}: {
  clientId: string;
  therapistId: string;
}): Promise<{
  contextBlock: string;
  metadata: {
    totalSessions: number;
    notesIncluded: number;
    totalNotesAvailable: number;
    summaryDocumentType: string | null;
    summaryDocumentDate: string | null;
    truncated: boolean;
    truncationStrategy: TruncationStrategy;
  };
}> {
  // ── Fetch all data concurrently ──────────────────────────────────────────
  const [client, notes, totalSessions] = await Promise.all([
    getClientById({ id: clientId }),
    getRecentClinicalNotesByClient({
      clientId,
      therapistId,
      limit: MAX_RECENT_NOTES,
    }),
    getClientSessionCount({ clientId, therapistId }),
  ]);

  // Verify this client belongs to the requesting therapist
  if (!client || client.therapistId !== therapistId) {
    return {
      contextBlock: "",
      metadata: {
        totalSessions: 0,
        notesIncluded: 0,
        totalNotesAvailable: 0,
        summaryDocumentType: null,
        summaryDocumentDate: null,
        truncated: false,
        truncationStrategy: "none",
      },
    };
  }

  const tiers: string[] = [];

  // ── Tier 1: Client record ────────────────────────────────────────────────
  const modalities =
    client.therapeuticModalities.length > 0
      ? client.therapeuticModalities.join(", ")
      : "Not specified";

  const tier1Lines = [
    "CLIENT CONTEXT:",
    "",
    `Presenting issues: ${client.presentingIssues ?? "Not recorded"}`,
    `Treatment goals: ${client.treatmentGoals ?? "Not recorded"}`,
    `Risk considerations: ${client.riskConsiderations ?? "None recorded"}`,
    `Background: ${client.background ?? "Not recorded"}`,
    `Therapeutic modalities: ${modalities}`,
    `Status: ${client.status}`,
    `Therapy start date: ${client.therapyStartDate ?? "Not recorded"}`,
    `Total sessions: ${totalSessions}`,
  ];

  tiers.push(tier1Lines.join("\n"));

  // ── Tier 2: Latest summary document ─────────────────────────────────────
  let summaryDocumentType: string | null = null;
  let summaryDocumentDate: string | null = null;

  for (const docType of SUMMARY_DOCUMENT_TYPES) {
    try {
      const doc = await getLatestDocumentByType({
        clientId,
        therapistId,
        documentType: docType,
      });

      if (doc) {
        summaryDocumentType = docType;
        summaryDocumentDate = doc.createdAt;

        const docLabel =
          docType === "case_formulation"
            ? "Case Formulation"
            : "Comprehensive Assessment";

        const dateStr = new Date(doc.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        const sectionLines = Object.entries(doc.content).map(
          ([section, text]) => `${section}:\n${text}`
        );

        const tier2Lines = [
          `CLINICAL SUMMARY (${docLabel}, last updated ${dateStr}):`,
          "",
          ...sectionLines,
        ];

        tiers.push(tier2Lines.join("\n"));
        break;
      }
    } catch {
      // If the document fetch fails for any reason, skip Tier 2 gracefully
    }
  }

  // ── Tier 3: Recent session notes ────────────────────────────────────────
  const totalNotesAvailable = notes.length;

  function buildNoteBlock(
    note: ClinicalNoteWithSession,
    truncateToChars?: number
  ): string {
    const dateStr = note.sessionDate
      ? new Date(note.sessionDate).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "Unknown date";

    const header = `--- Session: ${dateStr} | Format: ${note.noteFormat.toUpperCase()} | Status: ${note.status} ---`;
    let body = formatNoteContent(note);

    if (truncateToChars !== undefined && body.length > truncateToChars) {
      body = `${body.slice(0, truncateToChars)}[Note truncated]`;
    }

    return `${header}\n${body}`;
  }

  function buildTier3(
    notesSubset: ClinicalNoteWithSession[],
    truncateEachTo?: number
  ): string {
    if (notesSubset.length === 0) {
      return "RECENT SESSION NOTES (0 of 0 total):\n\nNo session notes available yet.";
    }
    const noteBlocks = notesSubset.map((note) =>
      buildNoteBlock(note, truncateEachTo)
    );
    const header = `RECENT SESSION NOTES (${notesSubset.length} of ${totalNotesAvailable} total):`;
    return [header, "", ...noteBlocks].join("\n");
  }

  // ── Combine tiers and apply budget truncation strategy ───────────────────
  const tier1And2 = tiers.join("\n\n");

  // notes are already ordered most-recent first (from the query)
  let activeTier3Notes = notes;
  let truncationStrategy: TruncationStrategy = "none";

  const buildFull = (): string =>
    [tier1And2, buildTier3(activeTier3Notes)].join("\n\n");

  if (buildFull().length > MAX_CONTEXT_CHARS) {
    // Strategy a: keep only the most recent half
    activeTier3Notes = notes.slice(0, Math.ceil(notes.length / 2));
    truncationStrategy = "reduced_notes";
  }

  if (buildFull().length > MAX_CONTEXT_CHARS) {
    // Strategy b: keep only the 3 most recent notes
    activeTier3Notes = notes.slice(0, 3);
    truncationStrategy = "minimal_notes";
  }

  if (buildFull().length > MAX_CONTEXT_CHARS) {
    // Strategy c: truncate each remaining note body to 500 characters
    truncationStrategy = "truncated_notes";
  }

  const contextBlock =
    truncationStrategy === "truncated_notes"
      ? [tier1And2, buildTier3(activeTier3Notes, 500)].join("\n\n")
      : buildFull();

  const truncated = truncationStrategy !== "none";

  if (truncated) {
    console.warn(
      `Chat context for client ${clientId} exceeded budget (${buildFull().length} chars). ` +
        `Applied ${truncationStrategy} strategy.`
    );
  }

  return {
    contextBlock,
    metadata: {
      totalSessions,
      notesIncluded: activeTier3Notes.length,
      totalNotesAvailable,
      summaryDocumentType,
      summaryDocumentDate,
      truncated,
      truncationStrategy,
    },
  };
}
