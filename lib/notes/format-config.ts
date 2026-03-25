import type { NoteFormat } from "@/lib/db/types";

export const SECTION_LABELS: Record<string, string> = {
  subjective: "Subjective",
  objective: "Objective",
  data: "Data",
  assessment: "Assessment",
  plan: "Plan",
  behaviour: "Behaviour",
  intervention: "Intervention",
  response: "Response",
  goals: "Goals",
  clinicalOpening: "Clinical Opening",
  sessionBody: "Session Body",
  clinicalSynthesis: "Clinical Synthesis & Risk",
  pathForward: "The Path Forward",
  body: "Notes",
};

export const SECTION_ORDER: Record<NoteFormat, string[]> = {
  soap: ["subjective", "objective", "assessment", "plan"],
  dap: ["data", "assessment", "plan"],
  birp: ["behaviour", "intervention", "response", "plan"],
  girp: ["goals", "intervention", "response", "plan"],
  narrative: [
    "clinicalOpening",
    "sessionBody",
    "clinicalSynthesis",
    "pathForward",
  ],
};

export const FORMAT_DESCRIPTIONS: Record<NoteFormat, string> = {
  soap: "Subjective, Objective, Assessment, Plan \u2014 the most widely used clinical note format.",
  dap: "Data, Assessment, Plan \u2014 a streamlined alternative to SOAP.",
  birp: "Behaviour, Intervention, Response, Plan \u2014 tracks observable behaviours and skills acquisition.",
  girp: "Goals, Intervention, Response, Plan \u2014 goal-driven format linking sessions to treatment plans.",
  narrative:
    "Chronological narrative covering session opening, body, clinical synthesis, and path forward.",
};

export const EXAMPLE_PROMPTS = [
  "Expand the assessment section",
  "Add risk considerations",
  "Reframe using person-centred language",
  "What's missing from these notes?",
];
