import { gateway } from "@ai-sdk/gateway";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { knowledgeSearchTools } from "@/lib/ai/tools/knowledge-search-tools";
import { searchKnowledgeBase } from "@/lib/ai/tools/search-knowledge-base";
import { auth } from "@/lib/auth";
import {
  getClientById,
  getSessionTranscriptText,
  getTherapistProfile,
  getTherapySession,
} from "@/lib/db/queries";
import type { RecordingType } from "@/lib/db/types";
import { formatClientRecord } from "@/lib/documents/context-assembly";

export const maxDuration = 120;

// ── System Prompt Builder ──────────────────────────────────────────────

function buildRefinementSystemPrompt({
  noteFormat,
  noteText,
  sourceMaterial,
  clientContext,
  modality,
  jurisdiction,
  recordingType,
}: {
  noteFormat: string;
  noteText: string;
  sourceMaterial: string;
  clientContext: string;
  modality: string;
  jurisdiction: string;
  recordingType: RecordingType;
}): string {
  const sourceLabel =
    recordingType === "written_notes"
      ? "therapist written notes"
      : recordingType === "therapist_summary"
        ? "therapist spoken summary transcript"
        : "session transcript";

  const clientContextBlock = clientContext || "CLIENT CONTEXT: Not available.";

  return `You are a clinical notes refinement assistant for qualified therapists in the UK and Ireland. The therapist has AI-generated clinical session notes and wants to refine them through conversation with you.

RULES FOR NOTE CONTENT:
- Use UK English spelling throughout (behaviour, colour, programme, etc.).
- Do NOT include client names or identifying information. Use "the client" as the primary way to refer to the client. Where a second reference within the same sentence would cause awkward repetition, use "they/them/their" instead (e.g., "The client mentioned that they had been feeling tired"). Do not use gendered pronouns (he/him/his, she/her/hers) even if the client's gender is known.
- Use observational, professional clinical language.
- If you include connections or hypotheses in the notes always frame them as uncertain using terms like "may", "might", "could be", "appears to be", "seems to be", etc. Avoid definitive language unless instructed by the therapist to use it.
- When writing notes, use "the therapist, not "you" - There is a subtle distinction here: Write the notes in the voice of a therapist writing in the 3rd person and refering to themselves as "the therapist", not as a separate party writing about the therapist in the 3rd person.
- When the therapist asks you to change, add, expand, rewrite, or remove content in the notes, use the update_notes tool to provide the complete updated note. IMPORTANT: Always include the FULL note text — all sections, not just the one you changed. Preserve sections the therapist did not ask you to modify.
- Do not fabricate clinical details. If the therapist asks you to expand a section and there is insufficient source material, say so and ask them to provide the detail.
- Prefer concise clinical language. Each section should be as brief as possible while remaining clinically complete and defensible.

RULES FOR YOUR CHAT RESPONSES:
- Keep responses to 1–3 sentences unless absolutely necessary. The therapist is here to refine notes, not have a discussion.
- Refer to the therapist as "you" in chat responses. 
- Do not use bullet lists, numbered lists, or bold/italic formatting in chat responses.
- If you have multiple suggestions, state them in a single short sentence (e.g., "You could also add a prognosis statement or link to treatment goals — want me to add either?").
- Do not repeat or summarise note content — the therapist can see the notes directly.
- IMPORTANT: Do not make changes the therapist has not requested. If you think something should be changed, suggest it briefly and wait for approval.
- If the therapist asks about clinical frameworks, guidelines, or legislation, use your search tools to find relevant knowledge base content, then incorporate it into the notes if the therapist agrees.

CURRENT NOTE FORMAT: ${noteFormat.toUpperCase()}

CURRENT NOTE CONTENT:
${noteText}

SOURCE MATERIAL (${sourceLabel}):
${sourceMaterial}

${clientContextBlock}

THERAPIST CONTEXT:
- Primary modality: ${modality || "Not specified"}
- Jurisdiction: ${jurisdiction || "Not specified"}`;
}

// ── update_notes Tool ──────────────────────────────────────────────────

const updateNotesTool = tool({
  description:
    "Replace the entire clinical notes with an updated version. Call this whenever the therapist asks you to change, add, expand, rewrite, or remove content. Always provide the COMPLETE updated note text — not just the changed section.",
  inputSchema: z.object({
    updatedNote: z
      .string()
      .describe(
        "The complete updated note text. Must include ALL sections with their UPPERCASE headers, not just the section that changed. Preserve all sections the therapist did not ask you to change."
      ),
    summary: z
      .string()
      .describe(
        "A brief, one-sentence summary of what was changed. This is shown to the therapist as confirmation."
      ),
  }),
  execute: ({ updatedNote, summary }) => {
    return { updatedNote, summary };
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
    const { messages, sessionId, noteText, noteFormat } = body as {
      messages: UIMessage[];
      sessionId: string;
      noteText: string;
      noteFormat: string;
    };

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 }
      );
    }

    if (!noteText || typeof noteText !== "string") {
      return NextResponse.json(
        { error: "noteText must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!noteFormat || typeof noteFormat !== "string") {
      return NextResponse.json(
        { error: "noteFormat is required" },
        { status: 400 }
      );
    }

    // Fetch the therapy session and verify ownership
    const therapySession = await getTherapySession({ id: sessionId });

    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (therapySession.therapistId !== authSession.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch source material, client context, and therapist profile in parallel
    const [sourceMaterial, client, therapistProfile] = await Promise.all([
      (async () => {
        if (therapySession.recordingType === "written_notes") {
          return therapySession.writtenNotes ?? "No source material available.";
        }
        const transcript = await getSessionTranscriptText({
          sessionId,
          recordingType: therapySession.recordingType ?? undefined,
          writtenNotes: therapySession.writtenNotes ?? null,
        });
        return transcript.length > 0
          ? transcript
          : "No source material available.";
      })(),
      therapySession.clientId
        ? getClientById({ id: therapySession.clientId })
        : Promise.resolve(null),
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

    // Build system prompt
    const systemPrompt = buildRefinementSystemPrompt({
      noteFormat,
      noteText,
      sourceMaterial,
      clientContext,
      modality,
      jurisdiction,
      recordingType: therapySession.recordingType,
    });

    // Convert UI messages to model messages for streamText
    const modelMessages = await convertToModelMessages(messages ?? []);

    // TODO: Add rate limiting — this route makes LLM calls on every message.
    // Consider per-user throttling (e.g. max 20 refinement messages per session per hour).

    // Stream the response
    const result = streamText({
      model: gateway.languageModel("anthropic/claude-sonnet-4-5"),
      system: systemPrompt,
      messages: modelMessages,
      tools: {
        update_notes: updateNotesTool,
        ...knowledgeSearchTools({ session: authSession }),
        searchKnowledgeBase: searchKnowledgeBase({ session: authSession }),
      },
      stopWhen: stepCountIs(6),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[notes/refine] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to process refinement request" },
      { status: 500 }
    );
  }
}
