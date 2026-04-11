import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
import { knowledgeSearchTools } from "@/lib/ai/tools/knowledge-search-tools";
import { searchKnowledgeBase } from "@/lib/ai/tools/search-knowledge-base";
import { auth } from "@/lib/auth";
import {
  getClientById,
  getClinicalDocument,
  getTherapistProfile,
} from "@/lib/db/queries";
import {
  assembleDocumentContext,
  formatClientRecord,
} from "@/lib/documents/context-assembly";
import type { ClinicalDocumentType } from "@/lib/documents/types";
import {
  CLINICAL_DOCUMENT_TYPES,
  getDocumentTypeConfig,
} from "@/lib/documents/types";

export const maxDuration = 120;

// ── System Prompt Builder ──────────────────────────────────────────────

function buildRefinementSystemPrompt({
  documentType,
  documentText,
  specContents,
  contextBlocks,
  clientContext,
  modality,
  jurisdiction,
}: {
  documentType: string;
  documentText: string;
  specContents: string;
  contextBlocks: Record<string, string>;
  clientContext: string;
  modality: string;
  jurisdiction: string;
}): string {
  const contextText = Object.values(contextBlocks).join("\n\n");
  const clientContextBlock = clientContext || "CLIENT CONTEXT: Not available.";

  return `You are a clinical documentation refinement assistant for qualified therapists in the UK and Ireland. The therapist has an AI-generated clinical document and wants to refine it through conversation with you.

RULES FOR DOCUMENT CONTENT:
- Use UK English spelling throughout (behaviour, colour, programme, etc.).
- Do NOT include client names or identifying information. Use "the client" as the primary way to refer to the client. Where a second reference within the same sentence would cause awkward repetition, use "they/them/their" instead (e.g., "The client mentioned that they had been feeling tired"). Do not use gendered pronouns (he/him/his, she/her/hers) even if the client's gender is known.
- Use observational, professional clinical language.
- If you include connections or hypotheses always frame them as uncertain using terms like "may", "might", "could be", "appears to be", "seems to be", etc. Avoid definitive language unless instructed by the therapist to use it.
- When writing document content, use "the therapist", not "you" - Write in the voice of a therapist writing in the 3rd person and referring to themselves as "the therapist", not as a separate party writing about the therapist in the 3rd person.
- When the therapist asks you to change, add, expand, rewrite, or remove content in the document, use the update_document tool to provide the complete updated document. IMPORTANT: Always include the FULL document text — all sections, not just the one you changed. Preserve sections the therapist did not ask you to modify.
- Do not fabricate clinical details. If the therapist asks you to expand a section and there is insufficient source material, say so and ask them to provide the detail.
- Prefer concise clinical language. Each section should be as brief as possible while remaining clinically complete and defensible.
- Plain text only: do NOT use inline markdown formatting. No bold (**), no italics (*), no sub-headers (###), no markdown bullet syntax (- or *), no code fences, backticks, blockquotes, tables, or links. Use UPPERCASE section headers on their own line.

RULES FOR YOUR CHAT RESPONSES:
- Keep responses to 1–3 sentences unless absolutely necessary. The therapist is here to refine a document, not have a discussion.
- Refer to the therapist as "you" in chat responses.
- Do not use bullet lists, numbered lists, or bold/italic formatting in chat responses.
- If you have multiple suggestions, state them in a single short sentence.
- Do not repeat or summarise document content — the therapist can see the document directly.
- IMPORTANT: Do not make changes the therapist has not requested. If you think something should be changed, suggest it briefly and wait for approval.
- If the therapist asks about clinical frameworks, guidelines, or legislation, use your search tools to find relevant knowledge base content, then incorporate it into the document if the therapist agrees.

DOCUMENT TYPE: ${documentType}

DOCUMENT SPECIFICATION:
${specContents}

CURRENT DOCUMENT CONTENT:
${documentText}

${contextText}

${clientContextBlock}

THERAPIST CONTEXT:
- Primary modality: ${modality || "Not specified"}
- Jurisdiction: ${jurisdiction || "Not specified"}`;
}

// ── update_document Tool ─────────────────────────────────────────────

const updateDocumentTool = tool({
  description:
    "Replace the entire clinical document with an updated version. Call this whenever the therapist asks you to change, add, expand, rewrite, or remove content. Always provide the COMPLETE updated document text — not just the changed section.",
  inputSchema: z.object({
    updatedDocument: z
      .string()
      .describe(
        "The complete updated document text. Must include ALL sections with their UPPERCASE headers, not just the section that changed. Preserve all sections the therapist did not ask you to change."
      ),
    summary: z
      .string()
      .describe(
        "A brief, one-sentence summary of what was changed. This is shown to the therapist as confirmation."
      ),
  }),
  execute: ({ updatedDocument, summary }) => {
    return { updatedDocument, summary };
  },
});

// ── Route Handler ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const authSession = await auth();

    if (!authSession?.user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const { messages, documentId, documentText, documentType } = body as {
      messages: UIMessage[];
      documentId: string;
      documentText: string;
      documentType: string;
    };

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 }
      );
    }

    if (!documentText || typeof documentText !== "string") {
      return NextResponse.json(
        { error: "documentText must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }

    if (
      !documentType ||
      !CLINICAL_DOCUMENT_TYPES.includes(documentType as ClinicalDocumentType)
    ) {
      return NextResponse.json(
        { error: "documentType is required and must be a valid document type" },
        { status: 400 }
      );
    }

    const validatedType = documentType as ClinicalDocumentType;

    // Fetch document and verify ownership
    const clinicalDocument = await getClinicalDocument({
      id: documentId,
      therapistId: authSession.user.id,
    });

    if (!clinicalDocument) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Fetch context, client, and therapist profile in parallel
    const [assembledContext, client, therapistProfile] = await Promise.all([
      assembleDocumentContext(validatedType, {
        clientId: clinicalDocument.clientId,
        therapistId: authSession.user.id,
      }),
      getClientById({ id: clinicalDocument.clientId }),
      getTherapistProfile({ userId: authSession.user.id }),
    ]);

    // Format client context
    let clientContext = "";
    let clientModality: string | undefined;
    if (client) {
      clientContext = formatClientRecord(client);
      clientModality =
        client.therapeuticModalities.length > 0
          ? client.therapeuticModalities.join(", ")
          : undefined;
    }

    const modality =
      clientModality || therapistProfile?.defaultModality || "Not specified";
    const jurisdiction = therapistProfile?.jurisdiction || "Not specified";

    // Load the spec file
    const config = getDocumentTypeConfig(validatedType);
    const specPath = join(
      process.cwd(),
      "lib",
      "documents",
      "specs",
      config.specFileName
    );
    const specContents = readFileSync(specPath, "utf-8");

    // Build system prompt
    const systemPrompt = buildRefinementSystemPrompt({
      documentType: config.label,
      documentText,
      specContents,
      contextBlocks: assembledContext.blocks,
      clientContext,
      modality,
      jurisdiction,
    });

    // Convert UI messages to model messages for streamText
    const modelMessages = await convertToModelMessages(messages ?? []);

    // Stream the response
    const result = streamText({
      model: getLanguageModel(DEFAULT_CHAT_MODEL),
      system: systemPrompt,
      messages: modelMessages,
      tools: {
        update_document: updateDocumentTool,
        ...knowledgeSearchTools({ session: authSession }),
        searchKnowledgeBase: searchKnowledgeBase({ session: authSession }),
      },
      stopWhen: stepCountIs(6),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[documents/refine] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to process refinement request" },
      { status: 500 }
    );
  }
}
