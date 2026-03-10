import type { ClinicalDocumentType } from "./types";

/**
 * Lightweight data counts — gathered cheaply without full context assembly.
 * The generation form's server component already fetches most of this data.
 */
export interface DataAvailability {
  /** True if client.presentingIssues is non-null and non-empty */
  hasPresentingIssues: boolean;
  /** True if client.treatmentGoals is non-null and non-empty */
  hasTreatmentGoals: boolean;
  /** True if client.riskConsiderations is non-null, non-empty, and not just "none" / "none recorded" / "n/a" */
  hasRiskConsiderations: boolean;
  /** Count of therapy_sessions for this client (any transcription status) */
  sessionCount: number;
  /** Count of therapy_sessions where transcription_status = 'completed' */
  completedSessionCount: number;
  /** Count of clinical_notes for this client (excluding status = 'generating') */
  noteCount: number;
  /** Count of clinical_notes where status = 'finalised' */
  finalisedNoteCount: number;
  /** Document types that exist for this client (latest non-superseded version, excluding 'generating' status) */
  existingDocumentTypes: ClinicalDocumentType[];
  /** Map of document type → status for existing documents */
  existingDocumentStatuses: Partial<Record<ClinicalDocumentType, string>>;
}

export interface SufficiencyResult {
  /** False if any blockers exist — generation should not proceed */
  canGenerate: boolean;
  /** Hard stops — data is fundamentally insufficient */
  blockers: string[];
  /** Thin data — document will be limited but potentially useful */
  warnings: string[];
  /** The raw availability data, for display in the UI */
  dataAvailable: DataAvailability;
}

export function checkDocumentSufficiency(
  documentType: ClinicalDocumentType,
  data: DataAvailability,
): SufficiencyResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  switch (documentType) {
    case "comprehensive_assessment": {
      if (!data.hasPresentingIssues) {
        blockers.push(
          "The client record has no presenting issues. A comprehensive assessment requires at minimum a description of why the client is seeking therapy. Please update the client record before generating.",
        );
      }
      if (data.sessionCount === 0) {
        warnings.push(
          "No sessions have been recorded for this client. The assessment will be based solely on the client record and will lack observational clinical detail.",
        );
      }
      if (data.noteCount === 0 && data.sessionCount > 0) {
        warnings.push(
          "Sessions exist but no clinical notes have been generated. Generating session notes first would provide richer source material for the assessment.",
        );
      }
      break;
    }

    case "case_formulation": {
      const hasAssessment = data.existingDocumentTypes.includes(
        "comprehensive_assessment",
      );
      if (
        !data.hasPresentingIssues &&
        !hasAssessment &&
        data.noteCount === 0
      ) {
        blockers.push(
          "A case formulation requires source data to work from. There are no presenting issues on the client record, no prior comprehensive assessment, and no session notes. Please add presenting issues to the client record, generate an assessment, or create session notes first.",
        );
      }
      if (!hasAssessment) {
        warnings.push(
          "No comprehensive assessment exists for this client. The formulation will be stronger if based on a completed assessment.",
        );
      }
      if (data.noteCount > 0 && data.noteCount < 3) {
        warnings.push(
          `Only ${data.noteCount} session note${data.noteCount === 1 ? "" : "s"} available. Case formulations benefit from multiple sessions to identify patterns — consider generating more session notes first.`,
        );
      }
      break;
    }

    case "risk_assessment": {
      if (!data.hasRiskConsiderations && data.noteCount === 0) {
        blockers.push(
          "There are no risk considerations recorded on the client record and no session notes to draw from. A risk assessment requires some clinical data about the client's risk profile. Please update the client record or generate session notes first.",
        );
      }
      if (!data.hasRiskConsiderations && data.noteCount > 0) {
        warnings.push(
          "No risk considerations are recorded on the client record. The assessment will be based on session notes only — review the output carefully to ensure nothing is missed.",
        );
      }
      break;
    }

    case "risk_safety_plan": {
      const hasRiskAssessment =
        data.existingDocumentTypes.includes("risk_assessment");
      if (!hasRiskAssessment) {
        blockers.push(
          "A safety management plan should be based on an identified set of risks. No risk assessment exists for this client. Please create a risk assessment first.",
        );
      }
      if (
        hasRiskAssessment &&
        data.existingDocumentStatuses.risk_assessment !== "finalised" &&
        data.existingDocumentStatuses.risk_assessment !== "reviewed"
      ) {
        warnings.push(
          "The existing risk assessment is still in draft. Consider reviewing and finalising it before generating a safety plan.",
        );
      }
      break;
    }

    case "treatment_plan": {
      const hasPlanAssessment = data.existingDocumentTypes.includes(
        "comprehensive_assessment",
      );
      if (!data.hasPresentingIssues && !hasPlanAssessment) {
        blockers.push(
          "A treatment plan requires clarity on what is being treated. There are no presenting issues on the client record and no prior assessment. Please update the client record or create an assessment first.",
        );
      }
      const hasFormulation =
        data.existingDocumentTypes.includes("case_formulation");
      if (!hasFormulation) {
        warnings.push(
          "No case formulation exists. A treatment plan will be more targeted if it is informed by a formulation linking the client's difficulties to maintaining factors.",
        );
      }
      if (data.noteCount > 0 && data.noteCount < 3) {
        warnings.push(
          `Only ${data.noteCount} session note${data.noteCount === 1 ? "" : "s"} available. Treatment plans are more effective when based on several sessions of clinical observation.`,
        );
      }
      break;
    }

    case "supervision_notes": {
      if (data.noteCount === 0) {
        warnings.push(
          "No session notes are available to reference. The supervision notes will rely entirely on any additional instructions you provide.",
        );
      }
      break;
    }

    case "discharge_summary": {
      if (data.completedSessionCount === 0) {
        blockers.push(
          "No completed sessions exist for this client. A discharge summary synthesises the therapeutic episode — there must be at least one session to summarise.",
        );
      }
      const hasTreatmentPlan =
        data.existingDocumentTypes.includes("treatment_plan");
      if (!hasTreatmentPlan) {
        warnings.push(
          "No treatment plan exists. The discharge summary will not be able to evaluate outcomes against planned goals.",
        );
      }
      const hasDischargeAssessment = data.existingDocumentTypes.includes(
        "comprehensive_assessment",
      );
      if (!hasDischargeAssessment) {
        warnings.push(
          "No comprehensive assessment exists. The discharge summary will have limited context for describing the client's initial presentation.",
        );
      }
      if (data.noteCount > 0 && data.noteCount < 3) {
        warnings.push(
          `Only ${data.noteCount} session note${data.noteCount === 1 ? "" : "s"} available. The discharge summary may lack detail on the therapeutic progression.`,
        );
      }
      break;
    }
  }

  return {
    canGenerate: blockers.length === 0,
    blockers,
    warnings,
    dataAvailable: data,
  };
}
