import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
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
- Do NOT include client names or identifying information. Use "the client" as the primary way to refer to the client. Where a second reference within the same sentence would cause awkward repetition, use "they/them/their" instead (e.g., "The client mentioned that they had been feeling tired this week"). Do not use gendered pronouns (he/him/his, she/her/hers) even if the client's gender is known.
- Do NOT diagnose. Use observational language throughout.
- Use your search tools to reference relevant clinical frameworks, guidelines, or legislation where applicable. Cite the source when you do.
- If the source data mentions risk factors, highlight these prominently in the appropriate section and note any actions taken or needed.
- Base the document ONLY on the data provided below. Do not infer or add clinical observations not supported by the source material. If insufficient data exists for a section, state "Insufficient data available — to be completed by therapist" rather than fabricating content.
- Word count guidance: ${config.wordCountGuidance}

DOCUMENT TYPE: ${config.label}
${config.shortDescription}

FORMAT INSTRUCTIONS:
Generate the document with clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

The sections are:
${sectionLines}

Plain text only: do NOT use inline markdown formatting within the document. No bold (**), no italics (*), no sub-headers (### or ##), no markdown bullet syntax (- or *), no code fences, backticks, blockquotes, tables, or links. Use full sentences and short paragraphs. The output is rendered in a plain text field — any markdown characters will appear literally.

IMPORTANT: The specification document below uses markdown for its own readability — it is NOT a formatting template. Do not mirror its formatting in your output.

Output your response in exactly this structure:
  <document>
  [The clinical document content — start with the first section header, end with the last line of content]
  </document>
  <commentary>
  [Any observations about the document generation: gaps in the source data, assumptions made, areas the therapist may want to review. If you have no observations, leave this empty.]
  </commentary>
  Do not include any text outside these two tags. No preamble, no closing remarks.

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

function parseGenerationOutput(text: string): {
  document: string;
  commentary: string;
} {
  const documentMatch = text.match(/<document>([\s\S]*?)<\/document>/);
  const commentaryMatch = text.match(/<commentary>([\s\S]*?)<\/commentary>/);
  return {
    document: documentMatch?.[1]?.trim() ?? text.trim(),
    commentary: commentaryMatch?.[1]?.trim() ?? "",
  };
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
      content: { body: "" },
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
        model: getLanguageModel(DEFAULT_CHAT_MODEL),
        system: systemPrompt,
        prompt: `Generate a ${config.label} document from the client data provided. Use the <document> and <commentary> XML structure as instructed.`,
        tools: {
          ...knowledgeSearchTools({ session }),
        },
        stopWhen: stepCountIs(6),
      });

      const { document: documentText, commentary } = parseGenerationOutput(
        result.text
      );

      // Update document with generated content and draft status
      const completedDocument = await updateClinicalDocument({
        id: placeholder.id,
        therapistId: session.user.id,
        content: { body: documentText },
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

      return NextResponse.json({ ...completedDocument, commentary });
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
