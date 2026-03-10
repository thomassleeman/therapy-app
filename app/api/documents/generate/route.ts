import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gateway } from "@ai-sdk/gateway";
import { generateText, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { knowledgeSearchTools } from "@/lib/ai/tools/knowledge-search-tools";
import { auth } from "@/lib/auth";
import {
  addDocumentReferences,
  createClinicalDocument,
  deleteClinicalDocument,
  getClientById,
  getClinicalDocumentsByClient,
  getClinicalNotesByClient,
  getTherapistProfile,
  getTherapySessions,
  updateClinicalDocument,
} from "@/lib/db/queries";
import { buildDataAvailability } from "@/lib/documents/build-data-availability";
import { assembleDocumentContext } from "@/lib/documents/context-assembly";
import { checkDocumentSufficiency } from "@/lib/documents/sufficiency";
import type { ClinicalDocumentType } from "@/lib/documents/types";
import {
  CLINICAL_DOCUMENT_TYPES,
  getDocumentTypeConfig,
} from "@/lib/documents/types";

export const maxDuration = 180;

function formatDate(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function buildSystemPrompt({
  config,
  specContents,
  contextBlocks,
  modality,
  jurisdiction,
  additionalInstructions,
}: {
  config: ReturnType<typeof getDocumentTypeConfig>;
  specContents: string;
  contextBlocks: Record<string, string>;
  modality: string;
  jurisdiction: string;
  additionalInstructions?: string;
}): string {
  const sectionLines = config.sections
    .map((section) => {
      const requiredNote = section.required
        ? "This section is required."
        : "This section is optional — include if relevant data is available.";
      return `- ${section.label}\n  ${section.description}\n  ${requiredNote}`;
    })
    .join("\n");

  const contextText = Object.values(contextBlocks).join("\n\n");

  const parts = [
    `You are a clinical documentation assistant for qualified therapists in the UK and Ireland. You generate draft clinical documents from aggregated client data. The therapist will review and edit these documents before finalising them.

RULES:
- Use UK English spelling throughout (behaviour, colour, programme, etc.).
- Do NOT include client names or identifying information. Use "the client" throughout.
- Do NOT diagnose. Use observational language throughout.
- Use your search tools to reference relevant clinical frameworks, guidelines, or legislation where applicable. Cite the source when you do.
- If the source data mentions risk factors, highlight these prominently in the appropriate section and note any actions taken or needed.
- Base the document ONLY on the data provided below. Do not infer or add clinical observations not supported by the source material. If insufficient data exists for a section, state "Insufficient data available — to be completed by therapist" rather than fabricating content.
- Word count guidance: ${config.wordCountGuidance}

DOCUMENT TYPE: ${config.label}
${config.shortDescription}

FORMAT INSTRUCTIONS:
Generate the document with clearly labelled sections using markdown headers (## Section Name). The sections are:
${sectionLines}

DOCUMENT SPECIFICATION:
${specContents}

${contextText}

THERAPIST CONTEXT:
- Primary modality: ${modality}
- Jurisdiction: ${jurisdiction}`,
  ];

  if (additionalInstructions) {
    parts.push(
      `THERAPIST'S ADDITIONAL INSTRUCTIONS:\n${additionalInstructions}`
    );
  }

  return parts.join("\n\n");
}

function parseSections(
  text: string,
  config: ReturnType<typeof getDocumentTypeConfig>
): Record<string, string> {
  const result: Record<string, string> = {};

  // Split on ## headers
  const parts = text.split(/^## /m);

  let extraIndex = 0;
  for (const part of parts) {
    // Skip any content before the first header
    if (!part.trim()) {
      continue;
    }

    const newlineIndex = part.indexOf("\n");
    if (newlineIndex === -1) {
      continue;
    }

    const headerText = part.substring(0, newlineIndex).trim();
    const body = part.substring(newlineIndex + 1).trim();

    // Try to match against known section labels
    const matchedSection = config.sections.find(
      (s) => s.label.toLowerCase() === headerText.toLowerCase()
    );

    if (matchedSection) {
      result[matchedSection.key] = body;
    } else if (headerText) {
      result[`_extra_${extraIndex}`] = `## ${headerText}\n${body}`;
      extraIndex++;
    }
  }

  // Fill in missing required sections
  for (const section of config.sections) {
    if (section.required && !result[section.key]) {
      result[section.key] =
        "[Section not generated — please complete manually]";
    }
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const {
      clientId,
      documentType,
      sessionIds,
      referenceDocumentIds,
      additionalInstructions,
      title,
    } = body as {
      clientId: string;
      documentType: string;
      sessionIds?: string[];
      referenceDocumentIds?: string[];
      additionalInstructions?: string;
      title?: string;
    };

    if (!clientId || !documentType) {
      return NextResponse.json(
        { error: "clientId and documentType are required" },
        { status: 400 }
      );
    }

    if (
      !CLINICAL_DOCUMENT_TYPES.includes(documentType as ClinicalDocumentType)
    ) {
      return NextResponse.json(
        {
          error: `Invalid documentType. Must be one of: ${CLINICAL_DOCUMENT_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const validatedType = documentType as ClinicalDocumentType;
    const config = getDocumentTypeConfig(validatedType);

    // Verify client exists and belongs to this therapist
    const client = await getClientById({ id: clientId });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (client.therapistId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Sufficiency check — fail fast before expensive context assembly or LLM calls
    const [sessions, notes, existingDocuments] = await Promise.all([
      getTherapySessions({ therapistId: session.user.id, clientId }),
      getClinicalNotesByClient({ clientId, therapistId: session.user.id }),
      getClinicalDocumentsByClient({ clientId, therapistId: session.user.id }),
    ]);

    const dataAvailability = buildDataAvailability({
      client: {
        presentingIssues: client.presentingIssues,
        treatmentGoals: client.treatmentGoals,
        riskConsiderations: client.riskConsiderations,
      },
      sessions: sessions.map((s) => ({
        transcriptionStatus: s.transcriptionStatus,
      })),
      notes: notes.map((n) => ({ status: n.status })),
      documents: existingDocuments.map((d) => ({
        documentType: d.documentType,
        status: d.status,
      })),
    });

    const sufficiency = checkDocumentSufficiency(
      validatedType,
      dataAvailability
    );

    if (!sufficiency.canGenerate) {
      return NextResponse.json(
        {
          error: "Insufficient data to generate this document",
          blockers: sufficiency.blockers,
          warnings: sufficiency.warnings,
        },
        { status: 422 }
      );
    }

    if (sufficiency.warnings.length > 0) {
      console.log(
        `[documents] Generating ${documentType} with warnings:`,
        sufficiency.warnings
      );
    }

    // Fetch therapist profile
    const therapistProfile = await getTherapistProfile({
      userId: session.user.id,
    });
    const modality = therapistProfile?.defaultModality || "Not specified";
    const jurisdiction = therapistProfile?.jurisdiction || "Not specified";

    // Load the markdown spec file
    const specPath = join(
      process.cwd(),
      "lib",
      "documents",
      "specs",
      config.specFileName
    );
    const specContents = readFileSync(specPath, "utf-8");

    // Assemble context from multiple data sources
    const assembledContext = await assembleDocumentContext(validatedType, {
      clientId,
      therapistId: session.user.id,
      sessionIds,
      referenceDocumentIds,
    });

    // Auto-generate title if not provided
    const documentTitle =
      title || `${config.label} — ${formatDate(new Date())}`;

    // Create placeholder document with 'generating' status
    const placeholder = await createClinicalDocument({
      clientId,
      therapistId: session.user.id,
      documentType: validatedType,
      title: documentTitle,
      content: {},
      status: "generating",
      generatedBy: "ai",
      modelUsed: "anthropic/claude-sonnet-4-5",
    });

    try {
      const systemPrompt = buildSystemPrompt({
        config,
        specContents,
        contextBlocks: assembledContext.blocks,
        modality,
        jurisdiction,
        additionalInstructions,
      });

      const result = await generateText({
        model: gateway.languageModel("anthropic/claude-sonnet-4-5"),
        system: systemPrompt,
        prompt: `Generate a ${config.label} document from the client data provided.`,
        tools: {
          ...knowledgeSearchTools({ session }),
        },
        stopWhen: stepCountIs(6),
      });

      const parsedContent = parseSections(result.text, config);

      // Update document with parsed content and draft status
      const completedDocument = await updateClinicalDocument({
        id: placeholder.id,
        therapistId: session.user.id,
        content: parsedContent,
        status: "draft",
      });

      // Create document references
      const refs: Array<{
        documentId: string;
        referenceType: "session" | "clinical_note" | "clinical_document";
        referenceId: string;
      }> = [];

      for (const sessionId of assembledContext.referencedSessions) {
        refs.push({
          documentId: placeholder.id,
          referenceType: "session",
          referenceId: sessionId,
        });
      }
      for (const noteId of assembledContext.referencedNotes) {
        refs.push({
          documentId: placeholder.id,
          referenceType: "clinical_note",
          referenceId: noteId,
        });
      }
      for (const docId of assembledContext.referencedDocuments) {
        refs.push({
          documentId: placeholder.id,
          referenceType: "clinical_document",
          referenceId: docId,
        });
      }

      if (refs.length > 0) {
        await addDocumentReferences(refs);
      }

      return NextResponse.json(completedDocument);
    } catch (generationError) {
      console.error("[documents] Generation failed:", generationError);
      // Clean up placeholder on failure
      await deleteClinicalDocument({
        id: placeholder.id,
        therapistId: session.user.id,
      });
      throw generationError;
    }
  } catch (error) {
    console.error("[documents] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to generate clinical document" },
      { status: 500 }
    );
  }
}
