import { gateway } from "@ai-sdk/gateway";
import { generateText, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { knowledgeSearchTools } from "@/lib/ai/tools/knowledge-search-tools";
import { auth } from "@/lib/auth";
import {
  createClinicalNote,
  getClientById,
  getSessionTranscriptText,
  getTherapistProfile,
  getTherapySession,
  updateTherapySession,
} from "@/lib/db/queries";
import type {
  DapNoteContent,
  FreeformNoteContent,
  NoteContent,
  NoteFormat,
  RecordingType,
  SoapNoteContent,
} from "@/lib/db/types";

export const maxDuration = 120;

const VALID_FORMATS: NoteFormat[] = ["soap", "dap", "progress", "freeform"];

const FORMAT_INSTRUCTIONS: Record<NoteFormat, string> = {
  soap: `Generate the note with four clearly labelled sections using markdown headers:

## Subjective
What the client reported — their experiences, feelings, and perceptions. Include brief direct quotes where clinically relevant (e.g., "I've been feeling overwhelmed at work").

## Objective
Observable presentation and therapeutic interventions used. Engagement level, affect, notable non-verbal cues mentioned in the transcript, techniques applied by the therapist.

## Assessment
Clinical formulation — how the session content relates to treatment goals and presenting issues. Note patterns, progress, setbacks, or emerging themes. Reference relevant clinical frameworks if applicable.

## Plan
Next steps — between-session tasks, focus for next session, referrals needed, risk management actions, and next session date if mentioned.`,

  dap: `Generate the note with three clearly labelled sections using markdown headers:

## Data
What was discussed and observed — combine client reports, therapist observations, and interventions used. Include significant quotes and themes.

## Assessment
Clinical interpretation. How does this session relate to treatment goals? Progress, setbacks, changes in risk level, emerging patterns.

## Plan
Next steps — between-session tasks, next session focus, referrals, risk management.`,

  progress:
    "Generate a narrative progress note in flowing prose paragraphs (not bullet points). Cover: session themes, interventions used and client response, emotional presentation, progress toward treatment goals, risk factors if any, and plan for next session.",

  freeform:
    "Generate a narrative progress note in flowing prose paragraphs (not bullet points). Cover: session themes, interventions used and client response, emotional presentation, progress toward treatment goals, risk factors if any, and plan for next session.",
};

const SUMMARY_FORMAT_INSTRUCTIONS: Record<NoteFormat, string> = {
  soap: `Generate the note with four clearly labelled sections using markdown headers:

## Subjective
What the therapist reported the client shared — their experiences, feelings, and perceptions as recalled by the therapist. Use reported speech rather than direct quotes (e.g. "The therapist noted that the client described feeling overwhelmed at work").

## Objective
Therapeutic interventions used and the therapist's recalled observations of the client's presentation. Engagement level, affect, and non-verbal cues as reported by the therapist in their summary. Note that these are recalled observations, not directly observed from a recording.

## Assessment
Clinical formulation — how the session content relates to treatment goals and presenting issues. Note patterns, progress, setbacks, or emerging themes. Reference relevant clinical frameworks if applicable.

## Plan
Next steps — between-session tasks, focus for next session, referrals needed, risk management actions, and next session date if mentioned.`,

  dap: `Generate the note with three clearly labelled sections using markdown headers:

## Data
What the therapist reported was discussed and observed — combine the therapist's account of client disclosures, their own recalled observations, and interventions used. Use reported speech for any paraphrased client statements.

## Assessment
Clinical interpretation. How does this session relate to treatment goals? Progress, setbacks, changes in risk level, emerging patterns.

## Plan
Next steps — between-session tasks, next session focus, referrals, risk management.`,

  progress:
    "Generate a narrative progress note in flowing prose paragraphs (not bullet points). Cover: session themes as reported by the therapist, interventions used and the therapist's recollection of client response, emotional presentation as recalled, progress toward treatment goals, risk factors if any, and plan for next session. Frame all observations as the therapist's account.",

  freeform:
    "Generate a narrative progress note in flowing prose paragraphs (not bullet points). Cover: session themes as reported by the therapist, interventions used and the therapist's recollection of client response, emotional presentation as recalled, progress toward treatment goals, risk factors if any, and plan for next session. Frame all observations as the therapist's account.",
};

function buildSystemPrompt({
  noteFormat,
  transcript,
  clientContext,
  modality,
  jurisdiction,
  additionalContext,
  recordingType,
}: {
  noteFormat: NoteFormat;
  transcript: string;
  clientContext: string;
  modality: string;
  jurisdiction: string;
  additionalContext?: string;
  recordingType?: RecordingType;
}): string {
  const isSummary = recordingType === "therapist_summary";
  const formatInstructions = isSummary
    ? SUMMARY_FORMAT_INSTRUCTIONS[noteFormat]
    : FORMAT_INSTRUCTIONS[noteFormat];

  const transcriptSourcePreamble = isSummary
    ? `TRANSCRIPT SOURCE:
This transcript is a therapist's spoken summary of a therapy session, recorded after the session ended. It is a single-speaker account — the therapist describing what happened during the session from their own perspective and recollection. There is no verbatim client dialogue.

When generating notes from this summary:
- Attribute observations to the therapist's account: use "The therapist reported that the client..." rather than "The client stated..."
- Where the therapist quotes or paraphrases the client, note it as reported speech
- Recognise that this is a recollection, not a verbatim record. Use language like "the therapist noted...", "the therapist recalled..."
- Do not fabricate direct client quotes

`
    : "";

  const parts = [
    `You are a clinical documentation assistant for qualified therapists in the UK and Ireland. You generate draft session notes from therapy session transcripts. The therapist will review and edit these notes before finalising them.

RULES:
- Use UK English spelling throughout (behaviour, colour, programme, etc.).
- Do NOT include client names or identifying information. Use "the client" throughout.
- Do NOT diagnose. Use observational language: "the client reported...", "the client appeared to...", "the client described..."
- Use your search tools to reference relevant clinical frameworks or guidelines where applicable. Cite the source when you do.
- If the transcript mentions risk factors (self-harm, safeguarding concerns, suicidal ideation), highlight these prominently in the appropriate section and note any actions taken or needed.
- Keep notes concise but clinically comprehensive: 300-600 words total.
- Base the notes ONLY on what is in the transcript. Do not infer or add clinical observations that aren't supported by the conversation.

${transcriptSourcePreamble}${formatInstructions}

SESSION TRANSCRIPT:
---
${transcript}
---`,
  ];

  if (clientContext) {
    parts.push(clientContext);
  }

  parts.push(
    `THERAPIST CONTEXT:
- Primary modality: ${modality}
- Jurisdiction: ${jurisdiction}`
  );

  if (additionalContext) {
    parts.push(`THERAPIST'S ADDITIONAL NOTES:
${additionalContext}`);
  }

  return parts.join("\n\n");
}

function parseSoapNote(text: string): SoapNoteContent | null {
  const subjectiveMatch = text.match(
    /## Subjective\s*\n([\s\S]*?)(?=## Objective|$)/i
  );
  const objectiveMatch = text.match(
    /## Objective\s*\n([\s\S]*?)(?=## Assessment|$)/i
  );
  const assessmentMatch = text.match(
    /## Assessment\s*\n([\s\S]*?)(?=## Plan|$)/i
  );
  const planMatch = text.match(/## Plan\s*\n([\s\S]*?)$/i);

  if (!subjectiveMatch || !objectiveMatch || !assessmentMatch || !planMatch) {
    return null;
  }

  return {
    subjective: subjectiveMatch[1].trim(),
    objective: objectiveMatch[1].trim(),
    assessment: assessmentMatch[1].trim(),
    plan: planMatch[1].trim(),
  };
}

function parseDapNote(text: string): DapNoteContent | null {
  const dataMatch = text.match(/## Data\s*\n([\s\S]*?)(?=## Assessment|$)/i);
  const assessmentMatch = text.match(
    /## Assessment\s*\n([\s\S]*?)(?=## Plan|$)/i
  );
  const planMatch = text.match(/## Plan\s*\n([\s\S]*?)$/i);

  if (!dataMatch || !assessmentMatch || !planMatch) {
    return null;
  }

  return {
    data: dataMatch[1].trim(),
    assessment: assessmentMatch[1].trim(),
    plan: planMatch[1].trim(),
  };
}

function parseNoteContent(
  text: string,
  noteFormat: NoteFormat
): { content: NoteContent; actualFormat: NoteFormat } {
  if (noteFormat === "soap") {
    const parsed = parseSoapNote(text);
    if (parsed) {
      return { content: parsed, actualFormat: "soap" };
    }
    console.warn(
      "[notes] Failed to parse soap format, falling back to freeform"
    );
    return {
      content: { body: text } as FreeformNoteContent,
      actualFormat: "freeform",
    };
  }

  if (noteFormat === "dap") {
    const parsed = parseDapNote(text);
    if (parsed) {
      return { content: parsed, actualFormat: "dap" };
    }
    console.warn(
      "[notes] Failed to parse dap format, falling back to freeform"
    );
    return {
      content: { body: text } as FreeformNoteContent,
      actualFormat: "freeform",
    };
  }

  // progress and freeform both return as freeform body
  return {
    content: { body: text } as FreeformNoteContent,
    actualFormat: noteFormat,
  };
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, noteFormat, additionalContext } = body as {
      sessionId: string;
      noteFormat: string;
      additionalContext?: string;
    };

    if (!sessionId || !noteFormat) {
      return NextResponse.json(
        { error: "sessionId and noteFormat are required" },
        { status: 400 }
      );
    }

    if (!VALID_FORMATS.includes(noteFormat as NoteFormat)) {
      return NextResponse.json(
        {
          error: `Invalid noteFormat. Must be one of: ${VALID_FORMATS.join(", ")}`,
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

    if (therapySession.therapistId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (therapySession.transcriptionStatus !== "completed") {
      return NextResponse.json(
        { error: "Session transcription is not yet completed" },
        { status: 400 }
      );
    }

    // Fetch transcript
    const transcript = await getSessionTranscriptText({
      sessionId,
      recordingType: therapySession.recordingType,
    });

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript found for this session" },
        { status: 400 }
      );
    }

    // Fetch client record if linked
    let clientContext = "";
    if (therapySession.clientId) {
      const client = await getClientById({ id: therapySession.clientId });
      if (client) {
        clientContext = `CLIENT CONTEXT:
- Presenting issues: ${client.presentingIssues || "not recorded"}
- Treatment goals: ${client.treatmentGoals || "not recorded"}
- Risk considerations: ${client.riskConsiderations || "none recorded"}`;
      }
    }

    // Fetch therapist profile for modality and jurisdiction
    const therapistProfile = await getTherapistProfile({
      userId: session.user.id,
    });
    const modality = therapistProfile?.defaultModality || "not specified";
    const jurisdiction = therapistProfile?.jurisdiction || "not specified";

    // Mark session as generating notes
    await updateTherapySession({ id: sessionId, notesStatus: "generating" });

    try {
      const systemPrompt = buildSystemPrompt({
        noteFormat: validatedFormat,
        transcript,
        clientContext,
        modality,
        jurisdiction,
        additionalContext,
        recordingType: therapySession.recordingType,
      });

      const result = await generateText({
        model: gateway.languageModel("anthropic/claude-sonnet-4-5"),
        system: systemPrompt,
        prompt: `Generate ${validatedFormat === "freeform" ? "a narrative" : validatedFormat.toUpperCase()} clinical note from the session transcript provided.`,
        tools: {
          ...knowledgeSearchTools({ session }),
        },
        stopWhen: stepCountIs(3),
      });

      const { content, actualFormat } = parseNoteContent(
        result.text,
        validatedFormat
      );

      const clinicalNote = await createClinicalNote({
        sessionId,
        therapistId: session.user.id,
        noteFormat: actualFormat,
        content,
        generatedBy: "ai",
        modelUsed: "anthropic/claude-sonnet-4-5",
      });

      // Mark session notes as draft
      await updateTherapySession({ id: sessionId, notesStatus: "draft" });

      return NextResponse.json(clinicalNote);
    } catch (generationError) {
      console.error("[notes] Generation failed:", generationError);
      // Reset notes status on failure
      await updateTherapySession({ id: sessionId, notesStatus: "none" });
      throw generationError;
    }
  } catch (error) {
    console.error("[notes] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to generate clinical note" },
      { status: 500 }
    );
  }
}
