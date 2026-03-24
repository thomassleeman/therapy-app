import type { NoteContent } from "@/lib/db/types";

/**
 * Converts any NoteContent variant into a flat Record<string, string>.
 * This normalises the various content shapes into a uniform format
 * for the refinement UI.
 */
export function flattenNoteContent(
  content: NoteContent,
): Record<string, string> {
  if ("subjective" in content) {
    return {
      subjective: content.subjective,
      objective: content.objective,
      assessment: content.assessment,
      plan: content.plan,
    };
  }
  if ("data" in content) {
    return {
      data: content.data,
      assessment: content.assessment,
      plan: content.plan,
    };
  }
  if ("behaviour" in content) {
    return {
      behaviour: content.behaviour,
      intervention: content.intervention,
      response: content.response,
      plan: content.plan,
    };
  }
  if ("goals" in content) {
    return {
      goals: content.goals,
      intervention: content.intervention,
      response: content.response,
      plan: content.plan,
    };
  }
  if ("clinicalOpening" in content) {
    return {
      clinicalOpening: content.clinicalOpening,
      sessionBody: content.sessionBody,
      clinicalSynthesis: content.clinicalSynthesis,
      pathForward: content.pathForward,
    };
  }
  if ("body" in content) {
    return { body: content.body };
  }
  return { body: JSON.stringify(content) };
}
