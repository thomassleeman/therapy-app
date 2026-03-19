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
  BirpNoteContent,
  DapNoteContent,
  FreeformNoteContent,
  GirpNoteContent,
  NarrativeNoteContent,
  NoteContent,
  NoteFormat,
  RecordingType,
  SoapNoteContent,
} from "@/lib/db/types";

export const maxDuration = 120;

const VALID_FORMATS: NoteFormat[] = [
  "soap",
  "dap",
  "birp",
  "girp",
  "narrative",
];

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
- Confidentiality: Do NOT include client names or identifying information. Use "the client" throughout.`;

// ── Format-Specific Instructions (Full Session) ────────────────────────

const FORMAT_INSTRUCTIONS: Record<NoteFormat, string> = {
  soap: `Generate the note with four clearly labelled sections using markdown headers:

## Subjective
Capture the patient's personal experience, personal views, feelings, or interim information provided by the patient or someone close to them.
- Chief Complaint (CC): State the primary reason for the visit, ideally in the patient's own words. If multiple complaints exist, identify the most significant or compelling problem.
- History of Present Illness (HPI): Open with a simple one-line statement including age, sex, and reason for visit. Elaborate on the CC using the OLDCARTS framework: Onset, Location, Duration, Characterisation, Alleviating/Aggravating factors, Radiation, Temporal factor, and Severity (1-10 scale).
- History: Include pertinent medical, surgical, family, and social history (using the HEADSS acronym where relevant).
- Review of Systems (ROS): Document system-based lists of symptoms if mentioned (e.g., General, Gastrointestinal, Musculoskeletal).

## Objective
Document observable, measurable, and verifiable data from the encounter.
- Include vital signs, physical exam findings, laboratory data, imaging results, and other diagnostic data where mentioned.
- Place clinical "signs" here (e.g., "abdominal tenderness to palpation") while keeping patient-reported "symptoms" in the Subjective section.

## Assessment
Synthesise subjective and objective evidence to arrive at a diagnosis and assess changes in problem status.
- Problem List: List diagnoses or presenting issues in order of importance.
- Differential Diagnosis: List possible diagnoses from most to least likely, explaining the thought process and including less likely but high-risk possibilities.

## Plan
Detail immediate and future steps for treatment and testing.
- For each problem, state needed testing with rationale, medications (name, dose, route, frequency) if applicable, specialist referrals, and patient education.

Style: Maintain a strict narrative flow that follows the logic of obtaining information (S), observing data (O), assessing the situation (A), and subsequently constructing a plan (P).`,

  dap: `Generate the note with three clearly labelled sections using markdown headers:

## Data
Document measurable, observable information from the session, including direct quotes, specific behaviours, and client statements.
- Significant Events: Capture two or three therapy-significant events, including who was involved, where it occurred, and how the client experienced the event.
- Therapist Interventions: Weave the clinician's behaviour directly into this section, documenting specific actions taken (e.g., interpretations offered, clarifications, or empathetic/supportive behaviour) to address the client's symptoms.
- Homework Review: Record how the client carried out previous assignments and any difficulties or successes they experienced.

## Assessment
Provide clinical interpretation of the data.
- Status and Progress: Interpret the client's current physical or emotional state, progress toward goals, and the severity of symptoms.
- Risk Factors: Record potential risk factors, including assessments of danger, suicidality, or homicidal ideation.
- Grounding: Ensure all clinical insights and conclusions are directly linked to the observable facts documented in the Data section.

## Plan
Recommend concise, future-oriented steps.
- Actionable Steps: Include specific therapeutic interventions and new homework assignments.
- Goal Alignment: Set clear, measurable, and achievable goals that align with the established treatment plan.
- Follow-up: Include reminders of topics to follow up on, actions the therapist needs to take before the next session, and the next appointment date if mentioned.

Style: Use a more free-flowing, condensed narrative style that follows the natural discourse of the session. Focus on specific, observable details (e.g., "client frequently tapped foot") instead of general, vague statements (e.g., "client seemed anxious").`,

  birp: `Generate the note with four clearly labelled sections using markdown headers:

## Behaviour
Describe the specific, observable behaviour worked on or seen during the session.
- Observation vs. Guess: Document what you saw (e.g., "tapped foot rapidly") rather than interpretations (e.g., "seemed anxious").
- Content: Include client appearance, direct quotes, enthusiasm or hesitation toward activities, and subjective reports of struggles (e.g., "feeling frustrated by schoolwork").

## Intervention
Document the therapeutic methods, techniques, or actions used by the therapist to address the behaviour.
- Specific Verbs: Use clinical action words such as: validated, encouraged, supported, role-played, modelled, prompted, recommended, taught, reviewed, or reinforced.
- Focus on meaningful specific interventions that link directly back to the client's treatment plan.

## Response
Record the client's verbal and non-verbal reaction to the specific interventions used.
- Include direct quotes to show thought patterns and note non-verbal cues like changes in posture, smiling, or becoming tearful.
- Explicitly state how the client felt about the techniques and whether the method was effective.

## Plan
Outline the concrete next steps for both the client and clinician.
- Include specific homework, planned interventions for the next session, and the date/time of the next appointment if mentioned.
- Every plan must include at least one client action and one clinician action to maintain momentum.

Style: Prioritise outward expressions of a client's state and skills acquisition over deep assessments of internal or psychoanalytic states. Use this format to highlight trends and changes in behavioural triggers over time, making progress directly visible through intervention-response links.`,

  girp: `Generate the note with four clearly labelled sections using markdown headers:

## Goals
Document the specific, established goals from the client's treatment plan that were addressed during the session.
- List the purpose of the session and the intended outcomes for the client.
- Ensure each goal is clearly defined and linked to the overall long-term treatment strategy.

## Intervention
Detail the specific methods, techniques, or therapeutic actions the clinician employed to help the client achieve the session's goals.
- Use precise clinical terms to describe the work performed, such as: implemented cognitive restructuring, facilitated role-play, or provided psychoeducation.
- Record exactly what was done during the session to move the client closer to their stated objectives.

## Response
Record the client's reaction to the interventions and their overall participation in the session.
- Include both verbal statements (direct quotes) and non-verbal observations (e.g., body language, affect).
- Note whether the client showed signs of improvement, resistance, or understanding regarding the goals discussed.

## Plan
Outline the next steps for future sessions and any tasks to be completed in the interim.
- Homework: Document specific assignments or "homework" given to the client to reinforce the session's work.
- Future Focus: Detail what the clinician will focus on in the following encounter to maintain momentum toward long-term goals.
- State the date and time of the next scheduled appointment if mentioned.

Style: Maintain a strict focus on the "Golden Thread," ensuring every intervention and response is framed in direct relation to the specific treatment goals identified at the start of the note. Prioritise documenting the efficacy of the session by showing a clear link between what the therapist did (Intervention) and how it affected the client's movement toward their goals (Response).`,

  narrative: `Generate the note with four clearly labelled sections using markdown headers:

## Clinical Opening
Start with the basic session logistics: date, time, duration, and modality (e.g., face-to-face, telehealth) if available from the transcript.
Briefly describe the client's initial appearance, mood, and any significant stressors or life changes reported at the start of the encounter.

## Session Body
Provide an impartial, respectful, and accurate chronological summary of the interactions.
- Thematic Integration: Instead of separate headers, weave the client's reported experiences (Subjective) together with your clinical observations (Objective).
- Therapeutic Activity: Document the specific interventions used (e.g., cognitive restructuring, empathetic validation, role-play) as they occurred within the dialogue.
- Client Engagement: Describe the client's response to these interventions, using direct quotes to illustrate their thought patterns and emotional shifts.

## Clinical Synthesis & Risk
Conclude with your professional interpretation of the session's themes and the client's progress toward their treatment goals.
- Explicitly state the status of any risk factors, such as suicidal or homicidal ideation, even if denied.

## The Path Forward
Record any homework assigned or strategies the client agreed to pursue.
Note the intended focus for the next session and the scheduled appointment date/time if mentioned.

Style: Follow the natural chronological sequence of the session to preserve the "story" and the evolution of the therapeutic work. Ensure the narrative remains factual and clinical; avoid using emotive or derogatory language, writing as if the client will eventually read the record. Capture only the essential clinical themes and meaningful exchanges required for continuity of care. Ensure the narrative clearly demonstrates how the session content relates back to the client's overarching treatment plan and objectives (the "Golden Thread").`,
};

// ── Format-Specific Instructions (Therapist Summary) ───────────────────
// For therapist-narrated summaries recorded after the session.
// Reframes all formats to use reported speech.

const SUMMARY_FORMAT_INSTRUCTIONS: Record<NoteFormat, string> = {
  soap: `Generate the note with four clearly labelled sections using markdown headers:

## Subjective
Capture the patient's personal experience as recalled and reported by the therapist.
- Chief Complaint (CC): State the primary reason for the visit as the therapist described it. Use reported speech (e.g., "The therapist noted that the client described feeling overwhelmed at work").
- History of Present Illness (HPI): Elaborate on the CC using the OLDCARTS framework where the therapist provides this information: Onset, Location, Duration, Characterisation, Alleviating/Aggravating factors, Radiation, Temporal factor, and Severity.
- History: Include pertinent medical, surgical, family, and social history as reported by the therapist.
- Do not fabricate direct client quotes. Use "the therapist reported that the client described..." throughout.

## Objective
Document the therapist's recalled observations of the client's presentation.
- Place the therapist's recalled clinical observations here, noting that these are recollections, not directly observed from a recording.
- Use language like "the therapist noted..." or "the therapist recalled..."

## Assessment
Synthesise the therapist's reported subjective and objective evidence.
- Problem List: List diagnoses or presenting issues in order of importance as identified by the therapist.
- Differential Diagnosis: Include the therapist's clinical reasoning about possible diagnoses.

## Plan
Detail immediate and future steps for treatment as reported by the therapist.

Style: Maintain a strict narrative flow (S→O→A→P). Acknowledge throughout that this is a therapist's post-session recollection, not a verbatim transcript.`,

  dap: `Generate the note with three clearly labelled sections using markdown headers:

## Data
Document what the therapist reported was discussed and observed — combine the therapist's account of client disclosures, their own recalled observations, and interventions used.
- Use reported speech for any paraphrased client statements (e.g., "the therapist recalled that the client mentioned...").
- Therapist Interventions: Document actions as recalled by the therapist.
- Homework Review: Record the therapist's account of how the client carried out previous assignments.
- Do not fabricate direct client quotes.

## Assessment
Clinical interpretation based on the therapist's reported observations.
- Status and Progress: Interpret the client's state as described by the therapist.
- Risk Factors: Record risk assessments as reported by the therapist.
- Grounding: Link conclusions to the therapist's reported observations in the Data section.

## Plan
Recommend concise, future-oriented steps as described by the therapist.
- Include specific therapeutic interventions and homework assignments the therapist reported assigning.
- Goal Alignment: Set goals that align with the established treatment plan.

Style: Use a condensed narrative style. Frame all observations as the therapist's account. Focus on specific, observable details as recalled by the therapist.`,

  birp: `Generate the note with four clearly labelled sections using markdown headers:

## Behaviour
Describe the specific, observable behaviour as recalled by the therapist.
- Document what the therapist reported observing rather than interpretations.
- Include the therapist's account of client appearance, reported statements, and engagement level.
- Do not fabricate direct client quotes; use reported speech throughout.

## Intervention
Document the therapeutic methods and techniques the therapist reported using.
- Use clinical action verbs: validated, encouraged, supported, role-played, modelled, prompted, recommended, taught, reviewed, or reinforced.
- Link interventions to the client's treatment plan.

## Response
Record the client's reaction as recalled and reported by the therapist.
- Use reported speech for any paraphrased client statements.
- Note non-verbal cues the therapist recalled (e.g., changes in posture, affect).
- Include the therapist's assessment of whether the intervention was effective.

## Plan
Outline the concrete next steps as described by the therapist.
- Include homework and planned interventions for the next session.
- Every plan should include at least one client action and one clinician action.

Style: Prioritise the therapist's recalled observations of outward expressions and skills acquisition. Frame all observations as the therapist's account.`,

  girp: `Generate the note with four clearly labelled sections using markdown headers:

## Goals
Document the treatment plan goals that the therapist reported addressing during the session.
- List the purpose of the session and intended outcomes as described by the therapist.
- Link each goal to the overall long-term treatment strategy.

## Intervention
Detail the methods and techniques the therapist reported employing.
- Use precise clinical terms to describe the work performed.
- Record what the therapist reported doing to move the client closer to their objectives.

## Response
Record the client's reaction as recalled by the therapist.
- Use reported speech for any paraphrased client statements. Do not fabricate direct quotes.
- Include the therapist's recalled observations of body language and affect.
- Note the therapist's assessment of improvement, resistance, or understanding.

## Plan
Outline the next steps as described by the therapist.
- Document homework and future session focus as reported.
- State the next appointment date/time if mentioned.

Style: Maintain focus on the "Golden Thread" linking interventions and responses to treatment goals. Frame everything as the therapist's post-session account.`,

  narrative: `Generate the note with four clearly labelled sections using markdown headers:

## Clinical Opening
Start with session logistics as reported by the therapist: date, duration, and modality if mentioned.
Describe the client's initial presentation as recalled by the therapist — mood, appearance, and any significant stressors reported at the start.

## Session Body
Provide a chronological summary based on the therapist's recollection of the session.
- Weave the therapist's reported observations together with their account of the client's experiences.
- Document interventions used as recalled by the therapist (e.g., cognitive restructuring, empathetic validation, role-play).
- Describe the client's response as reported by the therapist, using reported speech rather than fabricated direct quotes.
- Frame all observations as the therapist's account: "the therapist recalled...", "the therapist noted..."

## Clinical Synthesis & Risk
The therapist's professional interpretation of the session's themes and the client's progress.
- Explicitly state the status of any risk factors as assessed by the therapist, even if denied.

## The Path Forward
Record homework and strategies as reported by the therapist.
Note the intended focus for the next session and the scheduled appointment date/time if mentioned.

Style: Follow a chronological sequence as recalled by the therapist. Acknowledge throughout that this is a post-session recollection, not a verbatim transcript. Capture the essential clinical themes and meaningful exchanges. Ensure the narrative demonstrates the "Golden Thread" linking session content to the treatment plan.`,
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
}: {
  noteFormat: NoteFormat;
  transcript: string;
  clientContext: string;
  modality: string;
  jurisdiction: string;
  additionalContext?: string;
  recordingType?: RecordingType;
}): string {
  const isSummaryStyle =
    recordingType === "therapist_summary" ||
    recordingType === "written_notes";
  const formatInstructions = isSummaryStyle
    ? SUMMARY_FORMAT_INSTRUCTIONS[noteFormat]
    : FORMAT_INSTRUCTIONS[noteFormat];

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

// ── Parsers ────────────────────────────────────────────────────────────

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

function parseBirpNote(text: string): BirpNoteContent | null {
  const behaviourMatch = text.match(
    /## Behaviou?r\s*\n([\s\S]*?)(?=## Intervention|$)/i
  );
  const interventionMatch = text.match(
    /## Intervention\s*\n([\s\S]*?)(?=## Response|$)/i
  );
  const responseMatch = text.match(/## Response\s*\n([\s\S]*?)(?=## Plan|$)/i);
  const planMatch = text.match(/## Plan\s*\n([\s\S]*?)$/i);

  if (!behaviourMatch || !interventionMatch || !responseMatch || !planMatch) {
    return null;
  }

  return {
    behaviour: behaviourMatch[1].trim(),
    intervention: interventionMatch[1].trim(),
    response: responseMatch[1].trim(),
    plan: planMatch[1].trim(),
  };
}

function parseGirpNote(text: string): GirpNoteContent | null {
  const goalsMatch = text.match(
    /## Goals?\s*\n([\s\S]*?)(?=## Intervention|$)/i
  );
  const interventionMatch = text.match(
    /## Intervention\s*\n([\s\S]*?)(?=## Response|$)/i
  );
  const responseMatch = text.match(/## Response\s*\n([\s\S]*?)(?=## Plan|$)/i);
  const planMatch = text.match(/## Plan\s*\n([\s\S]*?)$/i);

  if (!goalsMatch || !interventionMatch || !responseMatch || !planMatch) {
    return null;
  }

  return {
    goals: goalsMatch[1].trim(),
    intervention: interventionMatch[1].trim(),
    response: responseMatch[1].trim(),
    plan: planMatch[1].trim(),
  };
}

function parseNarrativeNote(text: string): NarrativeNoteContent | null {
  const openingMatch = text.match(
    /## Clinical Opening\s*\n([\s\S]*?)(?=## Session Body|$)/i
  );
  const bodyMatch = text.match(
    /## Session Body\s*\n([\s\S]*?)(?=## Clinical Synthesis|$)/i
  );
  const synthesisMatch = text.match(
    /## Clinical Synthesis[^\n]*\n([\s\S]*?)(?=## The Path Forward|$)/i
  );
  const pathMatch = text.match(/## The Path Forward\s*\n([\s\S]*?)$/i);

  if (!openingMatch || !bodyMatch || !synthesisMatch || !pathMatch) {
    return null;
  }

  return {
    clinicalOpening: openingMatch[1].trim(),
    sessionBody: bodyMatch[1].trim(),
    clinicalSynthesis: synthesisMatch[1].trim(),
    pathForward: pathMatch[1].trim(),
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
      "[notes] Failed to parse soap format, falling back to freeform body"
    );
    return {
      content: { body: text } as FreeformNoteContent,
      actualFormat: noteFormat,
    };
  }

  if (noteFormat === "dap") {
    const parsed = parseDapNote(text);
    if (parsed) {
      return { content: parsed, actualFormat: "dap" };
    }
    console.warn(
      "[notes] Failed to parse dap format, falling back to freeform body"
    );
    return {
      content: { body: text } as FreeformNoteContent,
      actualFormat: noteFormat,
    };
  }

  if (noteFormat === "birp") {
    const parsed = parseBirpNote(text);
    if (parsed) {
      return { content: parsed, actualFormat: "birp" };
    }
    console.warn(
      "[notes] Failed to parse birp format, falling back to freeform body"
    );
    return {
      content: { body: text } as FreeformNoteContent,
      actualFormat: noteFormat,
    };
  }

  if (noteFormat === "girp") {
    const parsed = parseGirpNote(text);
    if (parsed) {
      return { content: parsed, actualFormat: "girp" };
    }
    console.warn(
      "[notes] Failed to parse girp format, falling back to freeform body"
    );
    return {
      content: { body: text } as FreeformNoteContent,
      actualFormat: noteFormat,
    };
  }

  // narrative
  const parsed = parseNarrativeNote(text);
  if (parsed) {
    return { content: parsed, actualFormat: "narrative" };
  }
  console.warn(
    "[notes] Failed to parse narrative format, falling back to freeform body"
  );
  return {
    content: { body: text } as FreeformNoteContent,
    actualFormat: noteFormat,
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

      const formatLabel =
        validatedFormat === "narrative"
          ? "a Narrative"
          : validatedFormat.toUpperCase();

      const result = await generateText({
        model: gateway.languageModel("anthropic/claude-sonnet-4-5"),
        system: systemPrompt,
        prompt: `Generate ${formatLabel} clinical note from the session transcript provided.`,
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
