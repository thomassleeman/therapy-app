import type { DataAvailability } from "./sufficiency";
import type { ClinicalDocumentType } from "./types";

interface BuildDataAvailabilityInput {
  client: {
    presentingIssues: string | null;
    treatmentGoals: string | null;
    riskConsiderations: string | null;
  };
  /** All sessions for this client */
  sessions: Array<{
    transcriptionStatus: string;
  }>;
  /** All clinical notes for this client (excluding status = 'generating') */
  notes: Array<{
    status: string;
  }>;
  /** Existing clinical documents for this client (latest, non-superseded, excluding 'generating') */
  documents: Array<{
    documentType: ClinicalDocumentType;
    status: string;
  }>;
}

const EMPTY_RISK_PATTERNS = [
  "none",
  "none recorded",
  "n/a",
  "na",
  "not applicable",
  "nil",
  "no risk",
  "no known risks",
];

function isSubstantiveText(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0;
}

function hasSubstantiveRiskConsiderations(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  return !EMPTY_RISK_PATTERNS.includes(trimmed);
}

export function buildDataAvailability(
  input: BuildDataAvailabilityInput,
): DataAvailability {
  const existingDocumentStatuses: Partial<
    Record<ClinicalDocumentType, string>
  > = {};
  for (const doc of input.documents) {
    existingDocumentStatuses[doc.documentType] = doc.status;
  }

  return {
    hasPresentingIssues: isSubstantiveText(input.client.presentingIssues),
    hasTreatmentGoals: isSubstantiveText(input.client.treatmentGoals),
    hasRiskConsiderations: hasSubstantiveRiskConsiderations(
      input.client.riskConsiderations,
    ),
    sessionCount: input.sessions.length,
    completedSessionCount: input.sessions.filter(
      (s) => s.transcriptionStatus === "completed",
    ).length,
    noteCount: input.notes.length,
    finalisedNoteCount: input.notes.filter((n) => n.status === "finalised")
      .length,
    existingDocumentTypes: input.documents.map((d) => d.documentType),
    existingDocumentStatuses,
  };
}
