import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { knowledgeSearchTools } from "@/lib/ai/tools/knowledge-search-tools";
import { auth } from "@/lib/auth";
import {
  createClinicalNote,
  getClientById,
  getCustomNoteFormat,
  getSessionTranscriptText,
  getTherapistProfile,
  getTherapySession,
  updateTherapySession,
} from "@/lib/db/queries";
import { formatClientRecord } from "@/lib/documents/context-assembly";
import type {
  CustomNoteFormat,
  NoteContent,
  NoteFormat,
  RecordingType,
} from "@/lib/db/types";
import { NOTE_FORMATS } from "@/lib/db/types";

export const maxDuration = 120;

// ── Custom format helpers ────────────────────────────────────────────

function isCustomFormat(format: string): boolean {
  return format.startsWith("custom:");
}

function extractCustomFormatId(format: string): string {
  return format.slice(7); // "custom:".length
}

function buildCustomFormatInstructions(format: CustomNoteFormat): string {
  const header =
    "Generate the note with clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.";

  const sectionInstructions = format.sections
    .map((section) => {
      const required = section.required
        ? "This section is required."
        : "This section is optional — include if relevant data is available.";
      return `${section.label.toUpperCase()}\n${section.description}\n${required}`;
    })
    .join("\n\n");

  let instructions = `${header}\n\n${sectionInstructions}`;

  if (format.generalRules) {
    instructions += `\n\nADDITIONAL FORMAT RULES:\n${format.generalRules}`;
  }

  return instructions;
}

// ── Universal Clinical Documentation Standards ─────────────────────────
// Derived from Aaron's clinical documentation specifications.
// Prepended to every system prompt regardless of note format.

const UNIVERSAL_STANDARDS = `UNIVERSAL CLINICAL DOCUMENTATION STANDARDS:

Core Documentation Standards:
- Accuracy and Objectivity: Record interactions, observations, and interventions impartially. Focus on observable facts and direct evidence rather than unsubstantiated subjective opinions.
- Timeliness: Notes should reflect the session content accurately as if completed within 24 hours of the session.
- Clarity and Conciseness: Be specific without overloading detail. Document only the minimum data necessary to tell the patient's unique story and support clinical decision-making.
- Professional Tone: Use professional, medical-grade UK English. Avoid derogatory, emotive, or biased language.
- Standardised Language: Use only abbreviations that are universally recognised within the field (e.g., CC, HPI, Dx). Avoid personal shorthand or jargon that would be inaccessible to other professionals.

Content Requirements:
- The "Story" and Rationale: Ensure the record reflects the unique narrative of the encounter and provides a clear rationale for clinical decision-making.
- Distinction of Information: Maintain a clear separation between patient-reported symptoms (subjective) and practitioner-observed signs (objective).
- Risk Assessment: Always document assessments of risk to self or others, including ideation, plan, intent, or history of self-harm.
- Treatment Alignment: Directly link all session data, interventions, and assessments to the established goals in the client's treatment plan.
- Attribution and Integrity: Clearly identify the author of each entry. When referencing prior data, use "copy by reference" rather than "note bloat" through wholesale text importation.

Ethical & Legal Compliance:
- Audience Awareness: Write with the understanding that notes have multiple audiences, including the client (via GDPR/Access to Records), other healthcare providers, and legal entities (via subpoena).
- Defensibility: Ensure every note is "adequate and defensible" if called upon by a court or regulatory body.
- Confidentiality: Do NOT include client names or identifying information. Use "the client" as the primary way to refer to the client. Where a second reference within the same sentence would cause awkward repetition, use "they/them/their" instead (e.g., "The client mentioned that they had been feeling tired this week"). Do not use gendered pronouns (he/him/his, she/her/hers) even if the client's gender is known.`;

// ── Format-Specific Instructions (Full Session) ────────────────────────

const FORMAT_INSTRUCTIONS: Record<NoteFormat, string> = {
  soap: `Generate the note with four clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

SUBJECTIVE
What the client reported — their experiences, feelings, and perceptions. Include brief direct quotes where clinically relevant (e.g., "I've been feeling overwhelmed at work").

OBJECTIVE
Observable presentation and therapeutic interventions used. Engagement level, affect, notable non-verbal cues mentioned in the transcript, techniques applied by the therapist.

ASSESSMENT
Clinical formulation — how the session content relates to treatment goals and presenting issues. Note patterns, progress, setbacks, or emerging themes. Reference relevant clinical frameworks if applicable.

PLAN
Next steps — between-session tasks, focus for next session, referrals needed, risk management actions, and next session date if mentioned.`,

  dap: `Generate the note with three clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

DATA
What was discussed and observed — combine client reports, therapist observations, and interventions used. Include significant quotes and themes.

ASSESSMENT
Clinical interpretation. How does this session relate to treatment goals? Progress, setbacks, changes in risk level, emerging patterns.

PLAN
Next steps — between-session tasks, next session focus, referrals, risk management.`,

  birp: `Generate the note with four clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

BEHAVIOUR
Observable client behaviours, demeanour, affect, and presentation during the session.

INTERVENTION
Specific therapeutic interventions and techniques used by the therapist during the session.

RESPONSE
The client's response to the interventions — engagement, progress, resistance, emotional shifts.

PLAN
Next steps — between-session tasks, focus for next session, referrals, risk management.`,

  girp: `Generate the note with four clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

GOALS
The treatment goals addressed in this session and the client's progress toward them.

INTERVENTION
Specific therapeutic interventions and techniques used by the therapist during the session.

RESPONSE
The client's response to the interventions — engagement, progress, resistance, emotional shifts.

PLAN
Next steps — between-session tasks, focus for next session, referrals, risk management.`,

  narrative: `Generate the note as a flowing clinical narrative. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line. Write in prose paragraphs, not bullet points.

CLINICAL OPENING
Brief overview of the session context, presenting concerns addressed, and the therapeutic focus.

SESSION BODY
Detailed account of the session — themes explored, interventions used, client responses, emotional shifts, and key moments. Write in flowing prose.

CLINICAL SYNTHESIS
Clinical formulation connecting session content to the broader treatment picture — progress, patterns, risk factors, and theoretical understanding.

THE PATH FORWARD
Next steps — between-session tasks, focus for next session, adjustments to the treatment approach, referrals, risk management.`,
};

// ── Format-Specific Instructions (Therapist Summary) ───────────────────
// For therapist-narrated summaries recorded after the session.
// Reframes all formats to use reported speech.

const SUMMARY_FORMAT_INSTRUCTIONS: Record<NoteFormat, string> = {
  soap: `Generate the note with four clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

SUBJECTIVE
The client's experience as recalled and reported by the therapist. Use reported speech throughout (e.g., "The therapist noted that the client described feeling overwhelmed at work"). Do not fabricate direct client quotes.

OBJECTIVE
The therapist's recalled observations of the client's presentation — affect, engagement, notable behaviours. Use language like "the therapist noted..." or "the therapist recalled..." to acknowledge these are recollections, not directly observed from a recording.

ASSESSMENT
Clinical formulation based on the therapist's reported subjective and objective evidence. How the session content relates to treatment goals and presenting issues. Note patterns, progress, setbacks, or emerging themes.

PLAN
Next steps as reported by the therapist — between-session tasks, focus for next session, referrals needed, risk management actions, and next session date if mentioned.`,

  dap: `Generate the note with three clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

DATA
What the therapist reported was discussed and observed — combine the therapist's account of client disclosures, their own recalled observations, and interventions used. Use reported speech for any paraphrased client statements. Do not fabricate direct client quotes.

ASSESSMENT
Clinical interpretation based on the therapist's reported observations. How the session relates to treatment goals. Progress, setbacks, changes in risk level, emerging patterns. Link conclusions to the therapist's reported observations.

PLAN
Next steps as described by the therapist — between-session tasks, next session focus, referrals, risk management. Include homework assignments the therapist reported assigning.`,

  birp: `Generate the note with four clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

BEHAVIOUR
Observable client behaviours as recalled by the therapist. Document what the therapist reported observing rather than interpretations. Include the therapist's account of client appearance, reported statements, and engagement level. Do not fabricate direct client quotes; use reported speech throughout.

INTERVENTION
Therapeutic methods and techniques the therapist reported using. Use clinical action verbs: validated, encouraged, supported, role-played, modelled, prompted, recommended, taught, reviewed, or reinforced.

RESPONSE
The client's reaction as recalled and reported by the therapist. Use reported speech for any paraphrased client statements. Note non-verbal cues the therapist recalled. Include the therapist's assessment of whether the intervention was effective.

PLAN
Next steps as described by the therapist — homework and planned interventions for the next session. Every plan should include at least one client action and one clinician action.`,

  girp: `Generate the note with four clearly labelled sections. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line.

GOALS
Treatment plan goals the therapist reported addressing during the session and the client's progress toward them as described by the therapist.

INTERVENTION
Methods and techniques the therapist reported employing. Use precise clinical terms to describe the work performed.

RESPONSE
The client's reaction as recalled by the therapist. Use reported speech for any paraphrased client statements. Do not fabricate direct quotes. Include the therapist's recalled observations of body language and affect.

PLAN
Next steps as described by the therapist — homework, future session focus, and next appointment date/time if mentioned.`,

  narrative: `Generate the note as a flowing clinical narrative. Use UPPERCASE section headers on their own line, with the section content starting on the next line. Separate sections with a blank line. Write in prose paragraphs, not bullet points.

CLINICAL OPENING
Session context as reported by the therapist — date, duration, and modality if mentioned. The client's initial presentation as recalled by the therapist.

SESSION BODY
Chronological account based on the therapist's recollection of the session. Weave the therapist's reported observations together with their account of the client's experiences. Document interventions as recalled by the therapist. Frame all observations as the therapist's account: "the therapist recalled...", "the therapist noted..." Do not fabricate direct client quotes.

CLINICAL SYNTHESIS
The therapist's professional interpretation of the session's themes and the client's progress. Explicitly state the status of any risk factors as assessed by the therapist, even if denied.

THE PATH FORWARD
Homework and strategies as reported by the therapist. Intended focus for the next session and scheduled appointment date/time if mentioned.`,
};

// ── System Prompt Builder ──────────────────────────────────────────────

function buildSystemPrompt({
  noteFormat,
  transcript,
  clientContext,
  modality,
  jurisdiction,
  additionalContext,
  recordingType,
  customFormat,
}: {
  noteFormat: string;
  transcript: string;
  clientContext: string;
  modality: string;
  jurisdiction: string;
  additionalContext?: string;
  recordingType?: RecordingType;
  customFormat?: CustomNoteFormat | null;
}): string {
  const isSummaryStyle =
    recordingType === "therapist_summary" || recordingType === "written_notes";

  let formatInstructions: string;

  if (customFormat) {
    formatInstructions = buildCustomFormatInstructions(customFormat);
  } else if (
    isSummaryStyle &&
    SUMMARY_FORMAT_INSTRUCTIONS[noteFormat as NoteFormat]
  ) {
    formatInstructions = SUMMARY_FORMAT_INSTRUCTIONS[noteFormat as NoteFormat];
  } else {
    formatInstructions = FORMAT_INSTRUCTIONS[noteFormat as NoteFormat];
  }

  const transcriptSourcePreamble =
    recordingType === "written_notes"
      ? `SOURCE MATERIAL:
These are brief, unformatted notes written by the therapist after the session. They are not a transcript — they are the therapist's own summary of key points from the session.

When generating notes from these written notes:
- Expand the brief notes into full, professionally structured clinical documentation
- Attribute observations to the therapist's account: use "The therapist reported that the client..." rather than "The client stated..."
- Where the therapist quotes or paraphrases the client, note it as reported speech
- Recognise that this is a post-session recollection. Use language like "the therapist noted...", "the therapist recalled..."
- Do not fabricate direct client quotes
- Do not invent details not present in the original notes

`
      : recordingType === "therapist_summary"
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

${UNIVERSAL_STANDARDS}

ADDITIONAL RULES:
- Use your search tools to reference relevant clinical frameworks or guidelines where applicable. Cite the source when you do.
- Base the notes ONLY on what is in the ${recordingType === "written_notes" ? "written notes" : "transcript"}. Do not infer or add clinical observations that aren't supported by the ${recordingType === "written_notes" ? "notes" : "conversation"}.
- Plain text only: do NOT use inline markdown formatting within section bodies. No bold (**), no italics (*), no other markdown syntax. Sub-section labels should be written as plain text (e.g. "Chief Complaint (CC): ..." not "**Chief Complaint (CC):**"). The output is rendered in a plain text field.
- Output your response in exactly this structure:
  <note>
  [The clinical note content — start with the first section header, end with the last line of content]
  </note>
  <commentary>
  [Any observations about the note generation: gaps in the source material, assumptions made, areas the therapist may want to review. If you have no observations, leave this empty.]
  </commentary>
  Do not include any text outside these two tags. No preamble, no closing remarks.

${transcriptSourcePreamble}FORMAT-SPECIFIC INSTRUCTIONS:
${formatInstructions}

${recordingType === "written_notes" ? "THERAPIST'S WRITTEN NOTES" : "SESSION TRANSCRIPT"}:
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

// ── Output Parser ─────────────────────────────────────────────────────

function parseGenerationOutput(text: string): {
  note: string;
  commentary: string;
} {
  const noteMatch = text.match(/<note>([\s\S]*?)<\/note>/);
  const commentaryMatch = text.match(/<commentary>([\s\S]*?)<\/commentary>/);
  return {
    note: noteMatch?.[1]?.trim() ?? text.trim(),
    commentary: commentaryMatch?.[1]?.trim() ?? "",
  };
}

// ── Route Handler ──────────────────────────────────────────────────────

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

    // Validate format: must be a built-in format or a custom format reference
    let customFormat: CustomNoteFormat | null = null;

    if (isCustomFormat(noteFormat)) {
      const formatId = extractCustomFormatId(noteFormat);
      customFormat = await getCustomNoteFormat({ id: formatId, therapistId: session.user.id });
      if (!customFormat) {
        return NextResponse.json(
          { error: "Custom format not found" },
          { status: 400 }
        );
      }
    } else if (!NOTE_FORMATS.includes(noteFormat as NoteFormat)) {
      return NextResponse.json(
        {
          error: `Invalid noteFormat. Must be one of: ${NOTE_FORMATS.join(", ")}, or a custom format (custom:{id})`,
        },
        { status: 400 }
      );
    }

    // Fetch the therapy session and verify ownership
    const therapySession = await getTherapySession({ id: sessionId });

    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (therapySession.therapistId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      therapySession.transcriptionStatus !== "completed" &&
      therapySession.transcriptionStatus !== "not_applicable"
    ) {
      return NextResponse.json(
        { error: "Session transcription is not yet completed" },
        { status: 400 }
      );
    }

    // Fetch transcript
    const transcript = await getSessionTranscriptText({
      sessionId,
      recordingType: therapySession.recordingType,
      writtenNotes: therapySession.writtenNotes,
    });

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript found for this session" },
        { status: 400 }
      );
    }

    // Fetch client record if linked
    let clientContext = "";
    let clientModality: string | undefined;
    if (therapySession.clientId) {
      const client = await getClientById({ id: therapySession.clientId });
      if (client) {
        clientContext = formatClientRecord(client);
        clientModality =
          client.therapeuticModalities.length > 0
            ? client.therapeuticModalities.join(", ")
            : undefined;
      }
    }

    // Fetch therapist profile for modality and jurisdiction
    const therapistProfile = await getTherapistProfile({
      userId: session.user.id,
    });
    const modality =
      clientModality || therapistProfile?.defaultModality || "not specified";
    const jurisdiction = therapistProfile?.jurisdiction || "not specified";

    // Mark session as generating notes
    await updateTherapySession({ id: sessionId, notesStatus: "generating" });

    try {
      const systemPrompt = buildSystemPrompt({
        noteFormat,
        transcript,
        clientContext,
        modality,
        jurisdiction,
        additionalContext,
        recordingType: therapySession.recordingType,
        customFormat,
      });

      const formatLabel = customFormat
        ? customFormat.name
        : noteFormat === "narrative"
          ? "a Narrative"
          : noteFormat.toUpperCase();

      const result = await generateText({
        model: anthropic("claude-sonnet-4-5-20250929"),
        system: systemPrompt,
        prompt: `Generate ${formatLabel} clinical note from the ${therapySession.recordingType === "written_notes" ? "written notes" : "session transcript"} provided. Use the <note> and <commentary> XML structure as instructed.`,
        tools: {
          ...knowledgeSearchTools({ session }),
        },
        stopWhen: stepCountIs(3),
      });

      const { note, commentary } = parseGenerationOutput(result.text);

      const noteContent: NoteContent = {
        body: note,
      };

      const clinicalNote = await createClinicalNote({
        sessionId,
        clientId: therapySession.clientId ?? undefined,
        therapistId: session.user.id,
        noteFormat,
        content: noteContent,
        generatedBy: "ai",
        modelUsed: "anthropic/claude-sonnet-4-5",
      });

      // Mark session notes as draft
      await updateTherapySession({ id: sessionId, notesStatus: "draft" });

      return NextResponse.json({ ...clinicalNote, commentary });
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
