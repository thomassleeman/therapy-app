import "server-only";

import {
  getClientById,
  getClinicalDocument,
  getClinicalDocumentsByClient,
  getClinicalNotesByClient,
  getLatestDocumentByType,
  getTherapistProfile,
  getTherapySessions,
} from "@/lib/db/queries";
import type { NoteContent } from "@/lib/db/types";
import type { ClinicalDocumentType, DataSource } from "./types";
import { DOCUMENT_TYPE_REGISTRY, getDocumentTypeConfig } from "./types";

// ── Public types ─────────────────────────────────────────────────────

export interface AssemblyContext {
  clientId: string;
  therapistId: string;
  /** Specific sessions to focus on (optional — if not provided, use all) */
  sessionIds?: string[];
  /** Specific document IDs to include as references */
  referenceDocumentIds?: string[];
}

export interface AssembledContext {
  /** Formatted text blocks keyed by data source, ready for prompt injection */
  blocks: Record<string, string>;
  /** IDs of all data used, for creating document references after generation */
  referencedSessions: string[];
  referencedNotes: string[];
  referencedDocuments: string[];
}

// ── Individual data source assemblers ────────────────────────────────

export async function assembleClientRecord(clientId: string): Promise<string> {
  const client = await getClientById({ id: clientId });

  if (!client) {
    return "CLIENT RECORD:\nNo client record found.";
  }

  return `CLIENT RECORD:
Presenting issues: ${client.presentingIssues || "Not recorded"}
Treatment goals: ${client.treatmentGoals || "Not recorded"}
Risk considerations: ${client.riskConsiderations || "None recorded"}
Background: ${client.background || "Not recorded"}
Therapeutic modalities: ${client.therapeuticModalities.length > 0 ? client.therapeuticModalities.join(", ") : "Not specified"}
Status: ${client.status}
Therapy start date: ${client.therapyStartDate || "Not recorded"}
Session frequency: ${client.sessionFrequency || "Not specified"}
Delivery method: ${client.deliveryMethod || "Not specified"}`;
}

export async function assembleSessionHistory(
  clientId: string,
  therapistId: string,
  sessionIds?: string[]
): Promise<{ text: string; referencedSessionIds: string[] }> {
  let sessions = await getTherapySessions({ therapistId, clientId });

  if (sessionIds && sessionIds.length > 0) {
    const idSet = new Set(sessionIds);
    sessions = sessions.filter((s) => idSet.has(s.id));
  }

  if (sessions.length === 0) {
    return {
      text: "SESSION HISTORY:\nNo session history available.",
      referencedSessionIds: [],
    };
  }

  // Sessions come back newest-first; sort oldest-first for the listing
  const sorted = [...sessions].sort(
    (a, b) =>
      new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
  );

  const earliest = sorted[0].sessionDate;
  const latest = sorted[sorted.length - 1].sessionDate;

  const lines = sorted.map((s, i) => {
    const duration = s.durationMinutes
      ? `${s.durationMinutes}min`
      : "duration unknown";
    const delivery = s.deliveryMethod || "not recorded";
    const transcription = s.transcriptionStatus;
    const notes = s.notesStatus;
    return `Session ${i + 1} — ${s.sessionDate}, ${duration}, ${delivery}\n  Transcription: ${transcription}, Notes: ${notes}`;
  });

  const text = `SESSION HISTORY:
Total sessions: ${sorted.length}
Date range: ${earliest} to ${latest}
${lines.join("\n")}`;

  return { text, referencedSessionIds: sorted.map((s) => s.id) };
}

function formatNoteContent(content: NoteContent, noteFormat: string): string {
  if (noteFormat === "soap" && "subjective" in content) {
    return `Subjective: ${content.subjective}\nObjective: ${content.objective}\nAssessment: ${content.assessment}\nPlan: ${content.plan}`;
  }
  if (noteFormat === "dap" && "data" in content) {
    return `Data: ${content.data}\nAssessment: ${content.assessment}\nPlan: ${content.plan}`;
  }
  if (noteFormat === "birp" && "behaviour" in content) {
    return `Behaviour: ${content.behaviour}\nIntervention: ${content.intervention}\nResponse: ${content.response}\nPlan: ${content.plan}`;
  }
  if (noteFormat === "girp" && "goals" in content) {
    return `Goals: ${content.goals}\nIntervention: ${content.intervention}\nResponse: ${content.response}\nPlan: ${content.plan}`;
  }
  if (noteFormat === "narrative" && "clinicalOpening" in content) {
    return `Clinical Opening: ${content.clinicalOpening}\nSession Body: ${content.sessionBody}\nClinical Synthesis & Risk: ${content.clinicalSynthesis}\nThe Path Forward: ${content.pathForward}`;
  }
  if ("body" in content) {
    return content.body;
  }
  return JSON.stringify(content);
}

export async function assembleClinicalNotes(
  clientId: string,
  therapistId: string
): Promise<{ text: string; referencedNoteIds: string[] }> {
  const notes = await getClinicalNotesByClient({ clientId, therapistId });

  // Only include notes with usable statuses
  const usableNotes = notes.filter(
    (n) =>
      n.status === "draft" ||
      n.status === "reviewed" ||
      n.status === "finalised"
  );

  if (usableNotes.length === 0) {
    return {
      text: "CLINICAL SESSION NOTES:\nNo clinical notes available.",
      referencedNoteIds: [],
    };
  }

  const blocks = usableNotes.map((n) => {
    const date = n.sessionDate || n.createdAt;
    const formatted = formatNoteContent(n.content, n.noteFormat);
    return `--- Session Note: ${date} (${n.noteFormat}) ---\n${formatted}`;
  });

  return {
    text: `CLINICAL SESSION NOTES:\n${blocks.join("\n")}`,
    referencedNoteIds: usableNotes.map((n) => n.id),
  };
}

export async function assemblePriorDocuments(
  clientId: string,
  therapistId: string,
  documentType: ClinicalDocumentType,
  referenceDocumentIds?: string[]
): Promise<{ text: string; referencedDocumentIds: string[] }> {
  const config = getDocumentTypeConfig(documentType);
  const referencedIds: string[] = [];
  const blocks: string[] = [];

  // 1. Fetch prerequisite documents in full
  for (const prereqType of config.advisoryPrerequisites) {
    const doc = await getLatestDocumentByType({
      clientId,
      therapistId,
      documentType: prereqType,
    });
    if (doc) {
      referencedIds.push(doc.id);
      const label = DOCUMENT_TYPE_REGISTRY[prereqType].label;
      const sectionLines = Object.entries(doc.content)
        .map(([key, text]) => {
          const sectionDef = DOCUMENT_TYPE_REGISTRY[prereqType].sections.find(
            (s) => s.key === key
          );
          const heading = sectionDef?.label || key;
          return `### ${heading}\n${text}`;
        })
        .join("\n\n");
      blocks.push(
        `--- ${label}: ${doc.title} (v${doc.version}, ${doc.status}, ${doc.createdAt}) ---\n${sectionLines}`
      );
    }
  }

  // 2. Fetch explicitly referenced documents in full
  if (referenceDocumentIds && referenceDocumentIds.length > 0) {
    for (const refId of referenceDocumentIds) {
      if (referencedIds.includes(refId)) continue; // Already included as prerequisite
      const doc = await getClinicalDocument({ id: refId, therapistId });
      if (doc) {
        referencedIds.push(doc.id);
        const label = DOCUMENT_TYPE_REGISTRY[doc.documentType].label;
        const sectionLines = Object.entries(doc.content)
          .map(([key, text]) => {
            const sectionDef = DOCUMENT_TYPE_REGISTRY[
              doc.documentType
            ].sections.find((s) => s.key === key);
            const heading = sectionDef?.label || key;
            return `### ${heading}\n${text}`;
          })
          .join("\n\n");
        blocks.push(
          `--- ${label}: ${doc.title} (v${doc.version}, ${doc.status}, ${doc.createdAt}) ---\n${sectionLines}`
        );
      }
    }
  }

  // 3. Include summaries of other non-prerequisite documents
  const allDocSummaries = await getClinicalDocumentsByClient({
    clientId,
    therapistId,
  });
  for (const summary of allDocSummaries) {
    if (referencedIds.includes(summary.id)) continue;
    if (summary.documentType === documentType) continue; // Skip same type
    const label = DOCUMENT_TYPE_REGISTRY[summary.documentType].label;
    blocks.push(
      `--- ${label}: ${summary.title} (v${summary.version}, ${summary.status}, ${summary.createdAt}) ---\n[Summary only — full content not included]`
    );
  }

  if (blocks.length === 0) {
    return {
      text: "PRIOR CLINICAL DOCUMENTS:\nNo prior clinical documents available.",
      referencedDocumentIds: [],
    };
  }

  return {
    text: `PRIOR CLINICAL DOCUMENTS:\n${blocks.join("\n")}`,
    referencedDocumentIds: referencedIds,
  };
}

export async function assembleTherapistContext(
  therapistId: string
): Promise<string> {
  const profile = await getTherapistProfile({ userId: therapistId });

  return `THERAPIST CONTEXT:
Primary modality: ${profile?.defaultModality || "Not specified"}
Jurisdiction: ${profile?.jurisdiction || "Not specified"}`;
}

// ── Data source → assembler mapping ──────────────────────────────────

type DataSourceAssembler = (
  ctx: AssemblyContext,
  documentType: ClinicalDocumentType
) => Promise<{
  block: string;
  sessionIds?: string[];
  noteIds?: string[];
  documentIds?: string[];
}>;

const DATA_SOURCE_ASSEMBLERS: Record<DataSource, DataSourceAssembler> = {
  client_record: async (ctx) => {
    const block = await assembleClientRecord(ctx.clientId);
    return { block };
  },
  session_history: async (ctx) => {
    const { text, referencedSessionIds } = await assembleSessionHistory(
      ctx.clientId,
      ctx.therapistId,
      ctx.sessionIds
    );
    return { block: text, sessionIds: referencedSessionIds };
  },
  clinical_notes: async (ctx) => {
    const { text, referencedNoteIds } = await assembleClinicalNotes(
      ctx.clientId,
      ctx.therapistId
    );
    return { block: text, noteIds: referencedNoteIds };
  },
  clinical_documents: async (ctx, documentType) => {
    const { text, referencedDocumentIds } = await assemblePriorDocuments(
      ctx.clientId,
      ctx.therapistId,
      documentType,
      ctx.referenceDocumentIds
    );
    return { block: text, documentIds: referencedDocumentIds };
  },
  // TODO: Implement transcript_excerpts assembler when transcript excerpt
  // selection UI is built. Requires a query function to fetch specific
  // transcript segments by IDs.
  transcript_excerpts: async () => {
    return {
      block:
        "TRANSCRIPT EXCERPTS:\nTranscript excerpt assembly not yet implemented.",
    };
  },
};

// ── Master assembly function ─────────────────────────────────────────

export async function assembleDocumentContext(
  documentType: ClinicalDocumentType,
  context: AssemblyContext
): Promise<AssembledContext> {
  const config = getDocumentTypeConfig(documentType);

  const blocks: Record<string, string> = {};
  const referencedSessions: string[] = [];
  const referencedNotes: string[] = [];
  const referencedDocuments: string[] = [];

  // Run all data source assemblers concurrently
  const results = await Promise.all(
    config.dataSources.map(async (source) => {
      const assembler = DATA_SOURCE_ASSEMBLERS[source];
      const result = await assembler(context, documentType);
      return { source, result };
    })
  );

  for (const { source, result } of results) {
    blocks[source] = result.block;
    if (result.sessionIds) referencedSessions.push(...result.sessionIds);
    if (result.noteIds) referencedNotes.push(...result.noteIds);
    if (result.documentIds) referencedDocuments.push(...result.documentIds);
  }

  // Always include therapist context
  blocks.therapist_context = await assembleTherapistContext(
    context.therapistId
  );

  return {
    blocks,
    referencedSessions,
    referencedNotes,
    referencedDocuments,
  };
}
