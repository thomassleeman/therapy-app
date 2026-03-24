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
import type { NoteFormat, RecordingType } from "@/lib/db/types";
import { NOTE_FORMATS } from "@/lib/db/types";

export const maxDuration = 120;

// ── System Prompt Builder ──────────────────────────────────────────────

function buildRefinementSystemPrompt({
  noteFormat,
  noteContent,
  sourceMaterial,
  clientContext,
  modality,
  jurisdiction,
  recordingType,
}: {
  noteFormat: NoteFormat;
  noteContent: Record<string, string>;
  sourceMaterial: string;
  clientContext: string;
  modality: string;
  jurisdiction: string;
  recordingType: RecordingType;
}): string {
  const noteContentBlock = Object.entries(noteContent)
    .map(([key, value]) => `## ${key}\n${value}`)
    .join("\n\n");

  const sourceLabel =
    recordingType === "written_notes"
      ? "therapist written notes"
      : recordingType === "therapist_summary"
        ? "therapist spoken summary transcript"
        : "session transcript";

  const clientContextBlock = clientContext
    ? `CLIENT CONTEXT:\n${clientContext}`
    : "CLIENT CONTEXT: Not available.";

  return `You are a clinical notes refinement assistant for qualified therapists in the UK and Ireland. The therapist has AI-generated clinical session notes and wants to refine them through conversation with you.

RULES:
- Use UK English spelling throughout (behaviour, colour, programme, etc.).
- Do NOT include client names or identifying information. Use "the client" throughout.
- Use observational, professional clinical language.
- When the therapist asks you to change, add, expand, rewrite, or remove content in the notes, use the update_notes tool to make the change. Always provide the complete updated section text in the tool call, not a diff or partial update.
- You may update multiple sections in a single tool call if the change spans sections.
- If the therapist asks about clinical frameworks, guidelines, or legislation, use your search tools to find relevant knowledge base content, then incorporate it into the notes if the therapist agrees.
- Do not make changes the therapist has not requested. If you think something should be changed, suggest it conversationally and wait for approval.
- Keep your conversational responses brief and focused. The therapist is here to refine notes, not have an extended discussion.
- If the therapist asks you to add content that is not supported by the source material, you may do so but add a bracketed note: [Added at therapist's direction — not present in original session record].
- Do not fabricate clinical details. If the therapist asks you to expand a section and there is insufficient source material, say so and ask them to provide the detail.

CURRENT NOTE FORMAT: ${noteFormat.toUpperCase()}

CURRENT NOTE CONTENT:
${noteContentBlock}

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
    "Update one or more sections of the clinical notes. Call this whenever the therapist asks you to change, add, expand, rewrite, or remove content. Always provide the complete new text for each section being updated.",
  inputSchema: z.object({
    updates: z
      .array(
        z.object({
          section: z
            .string()
            .describe(
              'The section key to update. Must match one of the keys in the current notes (e.g. "subjective", "objective", "assessment", "plan" for SOAP; "data", "assessment", "plan" for DAP; "behaviour", "intervention", "response", "plan" for BIRP; "goals", "intervention", "response", "plan" for GIRP; "clinicalOpening", "sessionBody", "clinicalSynthesis", "pathForward" for Narrative; "body" for Freeform).'
            ),
          content: z
            .string()
            .describe(
              "The complete new content for this section. Always provide the full section text, never a partial update or diff."
            ),
        })
      )
      .describe("Array of section updates to apply."),
    summary: z
      .string()
      .describe(
        "A brief, one-sentence summary of what was changed. This is shown to the therapist as confirmation."
      ),
  }),
  execute: ({ updates, summary }) => {
    return { updates, summary };
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
    const { messages, sessionId, noteContent, noteFormat } = body as {
      messages: UIMessage[];
      sessionId: string;
      noteContent: Record<string, string>;
      noteFormat: string;
    };

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 }
      );
    }

    if (!noteContent || typeof noteContent !== "object") {
      return NextResponse.json(
        { error: "noteContent must be a non-null object" },
        { status: 400 }
      );
    }

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!NOTE_FORMATS.includes(noteFormat as NoteFormat)) {
      return NextResponse.json(
        {
          error: `Invalid noteFormat. Must be one of: ${NOTE_FORMATS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const validatedFormat = noteFormat as NoteFormat;

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
    if (client) {
      clientContext = `- Presenting issues: ${client.presentingIssues || "not recorded"}
- Treatment goals: ${client.treatmentGoals || "not recorded"}
- Risk considerations: ${client.riskConsiderations || "none recorded"}`;
    }

    const modality = therapistProfile?.defaultModality || "Not specified";
    const jurisdiction = therapistProfile?.jurisdiction || "Not specified";

    // Build system prompt
    const systemPrompt = buildRefinementSystemPrompt({
      noteFormat: validatedFormat,
      noteContent: noteContent ?? {},
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
