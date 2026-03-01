/**
 * CRAG-style confidence routing for the therapy RAG pipeline.
 *
 * Location: lib/ai/confidence-router.ts
 *
 * WHY TIERED ROUTING INSTEAD OF TIERED FRAMING
 * ─────────────────────────────────────────────
 * The previous system used confidence tiers to change *how* the LLM framed its
 * response (hedging language, supervisor referral). Every tier still attempted
 * to answer from knowledge base content. This caused a critical bug: when
 * sensitive content was detected, MUST-search directives were injected into the
 * system prompt. If the KB had no relevant content, the LLM received
 * contradictory imperatives — search-first AND never present ungrounded content
 * AND no content exists — producing blank responses.
 *
 * This module implements CRAG-style routing where confidence determines
 * system *behaviour*, not just response *framing*:
 *
 * | Strategy         | Condition                                  |
 * |------------------|--------------------------------------------|
 * | grounded         | High confidence results exist              |
 * |                  | OR moderate + sensitive topic (use KB      |
 * |                  | content with hedging — better than nothing)|
 * | general_knowledge| Moderate confidence + non-sensitive topic  |
 * |                  | OR low confidence + non-sensitive topic    |
 * | graceful_decline | Low confidence + sensitive topic detected  |
 *
 * INTEGRATION POINTS
 * ──────────────────
 * Called from within the search tools (both domain-specific and base) after
 * `applyConfidenceThreshold`. The route is included in the tool response so
 * the LLM can select the appropriate behaviour via system prompt instructions.
 */

import type { ConfidenceAssessment, ScoredResult } from "@/lib/ai/confidence";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Discriminated union representing the three routing strategies.
 *
 * - `grounded`: KB results are reliable enough to cite. Use them as the
 *   primary source. If `confidenceNote` is present (moderate tier), include
 *   its hedging language.
 *
 * - `general_knowledge`: KB results are absent or insufficiently relevant for
 *   a non-sensitive topic. Respond from LLM training knowledge with a clear
 *   disclaimer that this is not platform-curated guidance.
 *
 * - `graceful_decline`: Low-confidence results on a sensitive topic where
 *   getting it wrong has disproportionate consequences. Do not attempt clinical
 *   guidance — acknowledge the gap and direct to appropriate human support.
 */
export type ConfidenceRoute<T> =
  | { strategy: "grounded"; results: T[]; confidenceNote: string | null }
  | { strategy: "general_knowledge"; disclaimer: string }
  | { strategy: "graceful_decline"; message: string };

// ─── Messages ────────────────────────────────────────────────────────────────

/**
 * Disclaimer prepended to general-knowledge responses so therapists know the
 * content is not sourced from the curated platform knowledge base.
 */
export const GENERAL_KNOWLEDGE_DISCLAIMER =
  "I don't have specific guidance on this in the knowledge base. The following is based on general clinical knowledge and should not be treated as verified platform guidance. Always consult your supervisor for case-specific decisions.";

/**
 * Formats an array of sensitive category slugs into a human-readable string.
 * e.g. ["suicidal_ideation", "safeguarding"] → "suicidal ideation and safeguarding"
 */
export function formatSensitiveCategories(categories: string[]): string {
  return categories.map((c) => c.replace(/_/g, " ")).join(" and ");
}

/**
 * Builds the graceful-decline message, interpolating the detected category
 * names so the response is specific to what was flagged.
 */
export function buildGracefulDeclineMessage(categories: string[]): string {
  const formatted = formatSensitiveCategories(categories);
  return (
    `This is an important question that touches on ${formatted}. ` +
    "The platform's knowledge base doesn't yet contain specific guidance to ground a reliable response on this topic. " +
    "I'd recommend discussing this with your clinical supervisor, safeguarding lead, or contacting your professional body (BACP, UKCP, IACP) directly for authoritative guidance. " +
    "I'm happy to help with other aspects of your reflection on this case."
  );
}

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Determines the response strategy based on confidence tier and whether
 * sensitive content was detected in the therapist's message.
 *
 * Routing logic:
 * - high → always grounded
 * - moderate + sensitive → grounded (KB guidance with hedging beats nothing)
 * - moderate + non-sensitive → general_knowledge
 * - low + sensitive → graceful_decline
 * - low + non-sensitive → general_knowledge
 *
 * @param confidenceAssessment - Output of `applyConfidenceThreshold`
 * @param sensitiveCategories - Category slugs from `detectSensitiveContent`
 * @returns A discriminated union with the strategy and its associated payload
 */
export function routeByConfidence<T extends ScoredResult>(
  confidenceAssessment: ConfidenceAssessment<T>,
  sensitiveCategories: string[]
): ConfidenceRoute<T> {
  const { confidenceTier, results, confidenceNote } = confidenceAssessment;

  if (confidenceTier === "high") {
    return { strategy: "grounded", results, confidenceNote };
  }

  if (confidenceTier === "moderate") {
    if (sensitiveCategories.length > 0) {
      // For sensitive topics, moderate KB guidance is better than nothing.
      // Use it with the hedging note already present in confidenceNote.
      return { strategy: "grounded", results, confidenceNote };
    }
    return {
      strategy: "general_knowledge",
      disclaimer: GENERAL_KNOWLEDGE_DISCLAIMER,
    };
  }

  // confidenceTier === "low"
  if (sensitiveCategories.length > 0) {
    return {
      strategy: "graceful_decline",
      message: buildGracefulDeclineMessage(sensitiveCategories),
    };
  }

  return {
    strategy: "general_knowledge",
    disclaimer: GENERAL_KNOWLEDGE_DISCLAIMER,
  };
}
