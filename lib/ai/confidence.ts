/**
 * Confidence threshold system for the therapy RAG pipeline.
 *
 * Location: lib/ai/confidence.ts
 *
 * WHY CONFIDENCE THRESHOLDS MATTER IN CLINICAL RAG
 * ─────────────────────────────────────────────────
 * In a general-purpose RAG system, returning low-relevance results is merely
 * unhelpful. In a clinical context, low-relevance results are *dangerous* —
 * a chunk about the wrong legal jurisdiction could mislead a therapist about
 * their statutory obligations, or a technique from the wrong modality could
 * contradict the therapist's clinical framework.
 *
 * This module implements a three-tier confidence system based on cosine
 * similarity scores from the hybrid search. The thresholds are intentionally
 * higher than typical RAG applications (0.65 minimum vs ~0.50 for general
 * use) because clinical applications demand higher retrieval precision.
 *
 * INTEGRATION POINTS
 * ──────────────────
 * Called from within the search tools (both domain-specific and base) before
 * results are returned to the LLM. The confidence tier and note are included
 * in the tool response so the LLM can adjust its citation confidence and
 * hedging language accordingly.
 *
 * Downstream, Task 4.6 (buildContextualResponse) uses the tier to decide
 * how to format the context injection — full results, hedged results, or
 * a supervisor-referral fallback.
 */

// ─── Tunable thresholds ─────────────────────────────────────────────────────
// These are named constants so they can be adjusted during the parameter
// tuning session (Task 5.5) without hunting through implementation code.

/**
 * Minimum similarity score for a result to be considered high confidence.
 * Above this threshold, the retrieved content is a strong semantic match
 * and the LLM can cite it without hedging.
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Minimum similarity score for a result to be included at all.
 * Below this, even the best result is not relevant enough to surface
 * in a clinical context. The system should decline to answer from
 * the knowledge base and refer the therapist to their supervisor.
 *
 * Note: 0.65 is deliberately higher than the ~0.50 threshold common
 * in general-purpose RAG systems. Clinical applications require
 * higher precision to avoid misleading practitioners.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;

/**
 * Maximum number of chunks to include in a confident response.
 * Limiting to 5 avoids diluting relevance with marginally related
 * content — the "Lost in the Middle" attention pattern means chunks
 * beyond the top few receive diminishing LLM attention anyway.
 */
export const MAX_CONFIDENT_RESULTS = 5;

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConfidenceTier = "high" | "moderate" | "low";

/**
 * A search result with at least a similarity score. This interface is
 * intentionally loose — it works with both the domain tools' camelCase
 * `similarityScore` and the base tool's snake_case `similarity_score`.
 * The `applyConfidenceThreshold` function normalises the field name
 * internally.
 */
export interface ScoredResult {
  similarityScore?: number | null;
  similarity_score?: number | null;
  [key: string]: unknown;
}

export interface ConfidenceAssessment<T extends ScoredResult> {
  /** Results filtered to those above the low confidence threshold,
   *  capped at MAX_CONFIDENT_RESULTS, sorted by similarity descending. */
  results: T[];
  /** The overall confidence tier for this result set. */
  confidenceTier: ConfidenceTier;
  /** A note for the LLM explaining how to handle these results.
   *  null for high confidence (no hedging needed). */
  confidenceNote: string | null;
  /** Average similarity score across all input results (before filtering). */
  averageSimilarity: number;
  /** Highest similarity score in the input results. */
  maxSimilarity: number;
  /** How many results were dropped for being below the low threshold. */
  droppedCount: number;
}

// ─── Confidence notes ───────────────────────────────────────────────────────
// Centralised here so the wording can be reviewed by Aaron and updated
// without touching the threshold logic.

const MODERATE_CONFIDENCE_NOTE =
  "This response draws on available guidelines, though the retrieved content " +
  "may not fully address your specific situation. Consider discussing this " +
  "with your supervisor for more targeted guidance.";

const LOW_CONFIDENCE_NOTE =
  "I wasn't able to find sufficiently relevant clinical guidance for this " +
  "specific question. I'd recommend consulting your clinical supervisor or " +
  "the relevant professional body directly.";

// ─── Core function ──────────────────────────────────────────────────────────

/**
 * Extracts the similarity score from a result, handling both camelCase
 * and snake_case field names from the different tool implementations.
 */
function extractSimilarityScore(result: ScoredResult): number {
  const score = result.similarityScore ?? result.similarity_score;
  // The hybrid_search RPC returns null for similarity_score when a chunk
  // was found only via full-text search (no vector match). Treat as 0
  // since we can't assess semantic relevance.
  return score ?? 0;
}

/**
 * Applies the three-tier confidence threshold system to a set of search results.
 *
 * The tier is determined by the *maximum* similarity score across all results,
 * not the average. Rationale: if the best result is a strong match, the query
 * is answerable from the knowledge base even if some lower-ranked results are
 * weaker. Conversely, if even the best result is below 0.65, no amount of
 * averaging will make the result set clinically reliable.
 *
 * Results below the low confidence threshold are always dropped regardless
 * of the overall tier — a high-confidence result set should not include
 * irrelevant trailing chunks.
 *
 * @param results - Array of search results with similarity scores
 * @returns Assessment including filtered results, tier, and guidance note
 *
 * @example
 * ```ts
 * const raw = await executeHybridSearch({ query, category: "legislation" });
 * const assessed = applyConfidenceThreshold(raw.results);
 *
 * return {
 *   ...assessed,
 *   query_used: query,
 * };
 * ```
 */
export function applyConfidenceThreshold<T extends ScoredResult>(
  results: T[]
): ConfidenceAssessment<T> {
  // Handle empty results — this is a low confidence case by definition
  if (results.length === 0) {
    return {
      results: [],
      confidenceTier: "low",
      confidenceNote: LOW_CONFIDENCE_NOTE,
      averageSimilarity: 0,
      maxSimilarity: 0,
      droppedCount: 0,
    };
  }

  // Calculate statistics across all input results
  const scores = results.map(extractSimilarityScore);
  const maxSimilarity = Math.max(...scores);
  const averageSimilarity =
    scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Filter out results below the low confidence threshold and sort by
  // similarity descending (highest first) to leverage the "Lost in the
  // Middle" attention pattern — the LLM pays most attention to the first
  // and last items in a sequence.
  const filteredResults = results
    .filter((r) => extractSimilarityScore(r) >= LOW_CONFIDENCE_THRESHOLD)
    .sort((a, b) => extractSimilarityScore(b) - extractSimilarityScore(a))
    .slice(0, MAX_CONFIDENT_RESULTS);

  const droppedCount = results.length - filteredResults.length;

  // Determine the tier based on the maximum score.
  // Even if we have some results above 0.65, if the *best* result is
  // below 0.65, nothing in the knowledge base is a good match.
  let confidenceTier: ConfidenceTier;
  let confidenceNote: string | null;

  if (maxSimilarity >= HIGH_CONFIDENCE_THRESHOLD) {
    confidenceTier = "high";
    confidenceNote = null;
  } else if (maxSimilarity >= LOW_CONFIDENCE_THRESHOLD) {
    confidenceTier = "moderate";
    confidenceNote = MODERATE_CONFIDENCE_NOTE;
  } else {
    confidenceTier = "low";
    confidenceNote = LOW_CONFIDENCE_NOTE;
    // Drop all results — none are clinically reliable
    return {
      results: [],
      confidenceTier,
      confidenceNote,
      averageSimilarity,
      maxSimilarity,
      droppedCount: results.length,
    };
  }

  return {
    results: filteredResults,
    confidenceTier,
    confidenceNote,
    averageSimilarity,
    maxSimilarity,
    droppedCount,
  };
}
