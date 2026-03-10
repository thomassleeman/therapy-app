// ── Clinical Document Types ──────────────────────────────────────────

export const CLINICAL_DOCUMENT_TYPES = [
  "comprehensive_assessment",
  "case_formulation",
  "risk_assessment",
  "risk_safety_plan",
  "treatment_plan",
  "supervision_notes",
  "discharge_summary",
] as const;

export type ClinicalDocumentType = (typeof CLINICAL_DOCUMENT_TYPES)[number];

export const CLINICAL_DOCUMENT_STATUSES = [
  "generating",
  "draft",
  "reviewed",
  "finalised",
] as const;

export type ClinicalDocumentStatus =
  (typeof CLINICAL_DOCUMENT_STATUSES)[number];

// ── Section definitions ──────────────────────────────────────────────

export interface DocumentSectionDef {
  key: string;
  label: string;
  required: boolean;
  description: string; // Shown to therapist in the UI as helper text
}

// ── Data source types ────────────────────────────────────────────────

export const DATA_SOURCES = [
  "client_record", // Client demographics, presenting issues, goals, risk considerations
  "session_history", // List of sessions with dates, durations, delivery methods
  "clinical_notes", // All finalised/draft session notes for this client
  "clinical_documents", // Prior documents (e.g., assessment referenced by treatment plan)
  "transcript_excerpts", // Selected transcript segments (for supervision notes)
] as const;

export type DataSource = (typeof DATA_SOURCES)[number];

// ── Document type configuration ──────────────────────────────────────

export interface DocumentTypeConfig {
  id: ClinicalDocumentType;
  label: string;
  shortDescription: string; // One-liner shown in document type picker
  sections: DocumentSectionDef[];
  dataSources: DataSource[];
  specFileName: string; // Filename of the markdown spec in lib/documents/specs/
  wordCountGuidance: string; // e.g., "800-1500 words"
  /** Document types that should exist before generating this one (advisory, not enforced) */
  advisoryPrerequisites: ClinicalDocumentType[];
}

// ── The registry ─────────────────────────────────────────────────────

export const DOCUMENT_TYPE_REGISTRY: Record<
  ClinicalDocumentType,
  DocumentTypeConfig
> = {
  comprehensive_assessment: {
    id: "comprehensive_assessment",
    label: "Comprehensive Assessment",
    shortDescription:
      "Foundational record gathering biological, psychological, and social data to understand the client's history and presenting problems.",
    sections: [
      {
        key: "referral_context",
        label: "Referral & Context",
        required: true,
        description:
          "How the client came to therapy, referral source, and presenting concerns.",
      },
      {
        key: "presenting_problems",
        label: "Presenting Problems",
        required: true,
        description:
          "Detailed description of current difficulties, onset, duration, and severity.",
      },
      {
        key: "history",
        label: "Relevant History",
        required: true,
        description:
          "Developmental, family, medical, psychiatric, social, and educational history.",
      },
      {
        key: "current_functioning",
        label: "Current Functioning",
        required: true,
        description:
          "Day-to-day functioning, relationships, work/education, coping strategies.",
      },
      {
        key: "risk_screen",
        label: "Risk Screening",
        required: true,
        description:
          "Initial screening of risk to self, risk to others, and safeguarding concerns.",
      },
      {
        key: "strengths_resources",
        label: "Strengths & Resources",
        required: false,
        description:
          "Protective factors, support networks, personal strengths, resilience indicators.",
      },
      {
        key: "clinical_impressions",
        label: "Clinical Impressions",
        required: true,
        description:
          "Therapist's initial formulation hypothesis, suitability for service, and recommended approach.",
      },
    ],
    dataSources: ["client_record", "session_history", "clinical_notes"],
    specFileName: "comprehensive-assessment.md",
    wordCountGuidance: "1000–2000 words",
    advisoryPrerequisites: [],
  },

  case_formulation: {
    id: "case_formulation",
    label: "Case Formulation",
    shortDescription:
      "Dynamic clinical narrative integrating assessment data to explain origin and maintenance of the client's difficulties.",
    sections: [
      {
        key: "summary_of_difficulties",
        label: "Summary of Difficulties",
        required: true,
        description:
          "Concise overview of the client's core presenting problems.",
      },
      {
        key: "predisposing_factors",
        label: "Predisposing Factors",
        required: true,
        description:
          "Early experiences, developmental factors, and vulnerabilities that made the client susceptible.",
      },
      {
        key: "precipitating_factors",
        label: "Precipitating Factors",
        required: true,
        description:
          "Recent events or triggers that brought the difficulties to a head.",
      },
      {
        key: "perpetuating_factors",
        label: "Perpetuating Factors",
        required: true,
        description:
          "Ongoing patterns, behaviours, cognitions, or circumstances maintaining the difficulties.",
      },
      {
        key: "protective_factors",
        label: "Protective Factors",
        required: true,
        description:
          "Strengths, resources, and supports that mitigate the difficulties.",
      },
      {
        key: "working_hypothesis",
        label: "Working Hypothesis",
        required: true,
        description:
          "Integrative narrative linking the above factors into a coherent explanatory model.",
      },
      {
        key: "implications_for_treatment",
        label: "Implications for Treatment",
        required: true,
        description:
          "How the formulation informs treatment approach, modality, focus areas, and potential obstacles.",
      },
    ],
    dataSources: [
      "client_record",
      "session_history",
      "clinical_notes",
      "clinical_documents",
    ],
    specFileName: "case-formulation.md",
    wordCountGuidance: "800–1500 words",
    advisoryPrerequisites: ["comprehensive_assessment"],
  },

  risk_assessment: {
    id: "risk_assessment",
    label: "Risk Assessment",
    shortDescription:
      "Structured evaluation of potential harm to self, harm to others, and safeguarding risks.",
    sections: [
      {
        key: "risk_to_self",
        label: "Risk to Self",
        required: true,
        description:
          "Suicidal ideation, self-harm history, current intent, and means. Include frequency, recency, and severity.",
      },
      {
        key: "risk_to_others",
        label: "Risk to Others",
        required: true,
        description:
          "History or indicators of harm to others, violent ideation, access to means.",
      },
      {
        key: "safeguarding",
        label: "Safeguarding Concerns",
        required: true,
        description:
          "Risk from others — abuse, neglect, exploitation, coercive control. Includes children and vulnerable adults.",
      },
      {
        key: "risk_factors",
        label: "Risk Factors",
        required: true,
        description:
          "Static and dynamic factors elevating risk — substance use, isolation, recent loss, impulsivity, etc.",
      },
      {
        key: "protective_factors",
        label: "Protective Factors",
        required: true,
        description:
          "Factors mitigating risk — support network, engagement in therapy, coping skills, future orientation.",
      },
      {
        key: "overall_risk_level",
        label: "Overall Risk Level & Rationale",
        required: true,
        description:
          "Summary risk level (low/medium/high) with clinical rationale. Distinguish imminent from chronic risk.",
      },
      {
        key: "recommended_actions",
        label: "Recommended Actions",
        required: true,
        description:
          "Immediate and ongoing actions: safety planning, referrals, increased session frequency, supervisor consultation.",
      },
    ],
    dataSources: [
      "client_record",
      "session_history",
      "clinical_notes",
      "clinical_documents",
    ],
    specFileName: "risk-assessment.md",
    wordCountGuidance: "600–1200 words",
    advisoryPrerequisites: [],
  },

  risk_safety_plan: {
    id: "risk_safety_plan",
    label: "Risk & Safety Management Plan",
    shortDescription:
      "Collaborative document outlining triggers, strategies, and a co-produced safety plan for acute crises.",
    sections: [
      {
        key: "identified_triggers",
        label: "Identified Triggers",
        required: true,
        description:
          "Situations, emotions, thoughts, or events that increase risk.",
      },
      {
        key: "warning_signs",
        label: "Warning Signs",
        required: true,
        description:
          "Observable indicators (to self and others) that risk is escalating.",
      },
      {
        key: "coping_strategies",
        label: "Coping Strategies",
        required: true,
        description:
          "Self-management techniques the client can use independently when triggered.",
      },
      {
        key: "support_contacts",
        label: "Support Contacts",
        required: true,
        description:
          "People and services the client can reach out to, in escalation order.",
      },
      {
        key: "professional_contacts",
        label: "Professional & Emergency Contacts",
        required: true,
        description:
          "Therapist, GP, crisis line, A&E — with contact details and when to use each.",
      },
      {
        key: "environment_safety",
        label: "Making the Environment Safe",
        required: false,
        description:
          "Steps to reduce access to means — agreed collaboratively with the client.",
      },
      {
        key: "reasons_for_living",
        label: "Reasons for Living",
        required: false,
        description:
          "Client-identified motivations, values, and commitments that support safety.",
      },
      {
        key: "review_schedule",
        label: "Review Schedule",
        required: true,
        description: "When and how this plan will be reviewed and updated.",
      },
    ],
    dataSources: ["client_record", "clinical_notes", "clinical_documents"],
    specFileName: "risk-safety-plan.md",
    wordCountGuidance: "400–800 words",
    advisoryPrerequisites: ["risk_assessment"],
  },

  treatment_plan: {
    id: "treatment_plan",
    label: "Treatment Plan",
    shortDescription:
      "Goal-oriented framework with measurable objectives, evidence-based interventions, and anticipated duration.",
    sections: [
      {
        key: "presenting_problems_summary",
        label: "Presenting Problems Summary",
        required: true,
        description:
          "Brief summary of the core difficulties being addressed (derived from assessment/formulation).",
      },
      {
        key: "treatment_goals",
        label: "Treatment Goals",
        required: true,
        description:
          "Collaboratively agreed goals — measurable, specific, and linked to the presenting problems. Use SMART format.",
      },
      {
        key: "interventions",
        label: "Planned Interventions",
        required: true,
        description:
          "Evidence-based interventions and techniques to be used, with rationale linked to the formulation.",
      },
      {
        key: "modality_and_approach",
        label: "Modality & Approach",
        required: true,
        description:
          "Therapeutic framework, anticipated structure (frequency, duration, number of sessions).",
      },
      {
        key: "outcome_measures",
        label: "Outcome Measures",
        required: false,
        description:
          "Formal measures or indicators to track progress (e.g., PHQ-9, GAD-7, CORE-OM, or qualitative markers).",
      },
      {
        key: "risk_management",
        label: "Risk Management",
        required: true,
        description:
          "How identified risks will be monitored and managed during treatment.",
      },
      {
        key: "review_points",
        label: "Review Points",
        required: true,
        description: "Scheduled points to review progress and adjust the plan.",
      },
    ],
    dataSources: [
      "client_record",
      "session_history",
      "clinical_notes",
      "clinical_documents",
    ],
    specFileName: "treatment-plan.md",
    wordCountGuidance: "800–1500 words",
    advisoryPrerequisites: ["comprehensive_assessment", "case_formulation"],
  },

  supervision_notes: {
    id: "supervision_notes",
    label: "Supervision Notes",
    shortDescription:
      "Record of consultation with a supervisor — clinical guidance, ethical reflections, and resulting care changes.",
    sections: [
      {
        key: "clients_discussed",
        label: "Clients Discussed",
        required: true,
        description:
          "Which clients were brought to supervision and the key issues raised for each.",
      },
      {
        key: "clinical_guidance",
        label: "Clinical Guidance Received",
        required: true,
        description:
          "Supervisor's feedback, suggestions, and clinical direction.",
      },
      {
        key: "ethical_reflections",
        label: "Ethical Reflections",
        required: false,
        description:
          "Ethical dilemmas discussed, boundary considerations, and professional conduct matters.",
      },
      {
        key: "action_items",
        label: "Action Items",
        required: true,
        description:
          "Specific changes to client care, follow-ups, or professional development actions arising from supervision.",
      },
      {
        key: "therapist_wellbeing",
        label: "Therapist Wellbeing",
        required: false,
        description:
          "Any discussion of therapist self-care, countertransference, vicarious trauma, or caseload management.",
      },
    ],
    dataSources: ["client_record", "clinical_notes", "clinical_documents"],
    specFileName: "supervision-notes.md",
    wordCountGuidance: "400–800 words",
    advisoryPrerequisites: [],
  },

  discharge_summary: {
    id: "discharge_summary",
    label: "Closing / Discharge Summary",
    shortDescription:
      "Final synthesis of the therapeutic episode — interventions, outcomes, and recommendations for future care.",
    sections: [
      {
        key: "referral_summary",
        label: "Referral & Presenting Problems",
        required: true,
        description:
          "Brief recap of why the client entered therapy and their initial presentation.",
      },
      {
        key: "treatment_summary",
        label: "Treatment Summary",
        required: true,
        description:
          "Overview of the therapeutic approach, key interventions used, number of sessions, and duration.",
      },
      {
        key: "progress_and_outcomes",
        label: "Progress & Outcomes",
        required: true,
        description:
          "What changed — gains made against treatment goals, formal outcome measures if used, client's self-report.",
      },
      {
        key: "remaining_difficulties",
        label: "Remaining Difficulties",
        required: false,
        description:
          "Issues that were not fully resolved, ongoing vulnerabilities, or areas that may benefit from further work.",
      },
      {
        key: "risk_at_discharge",
        label: "Risk at Discharge",
        required: true,
        description:
          "Current risk level and any ongoing safety considerations.",
      },
      {
        key: "recommendations",
        label: "Recommendations",
        required: true,
        description:
          "Suggestions for future care — relapse prevention strategies, referrals, self-help resources, GP communication.",
      },
      {
        key: "reason_for_ending",
        label: "Reason for Ending",
        required: true,
        description:
          "Mutual agreement, client-initiated, service-initiated, or external factors.",
      },
    ],
    dataSources: [
      "client_record",
      "session_history",
      "clinical_notes",
      "clinical_documents",
    ],
    specFileName: "discharge-summary.md",
    wordCountGuidance: "800–1500 words",
    advisoryPrerequisites: ["comprehensive_assessment", "treatment_plan"],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

export function getDocumentTypeConfig(
  type: ClinicalDocumentType
): DocumentTypeConfig {
  return DOCUMENT_TYPE_REGISTRY[type];
}

export function getDocumentTypeLabel(type: ClinicalDocumentType): string {
  return DOCUMENT_TYPE_REGISTRY[type].label;
}
