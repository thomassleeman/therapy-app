/**
 * Cohere reranking utility for the therapy RAG pipeline.
 *
 * Location: lib/ai/rerank.ts
 *
 * WHY RERANKING?
 * ─────────────
 * Hybrid search (vector similarity + full-text) produces candidates ranked by
 * cosine distance or RRF scores. These scores measure embedding proximity, not
 * true semantic relevance. A cross-encoder reranker (Cohere rerank-v3.5)
 * evaluates each query-document pair jointly, producing relevance scores that
 * are far more accurate. Research shows contextual retrieval + hybrid search +
 * reranking achieves 67% fewer retrieval failures than without reranking.
 *
 * GATE CONDITIONS
 * ───────────────
 * Reranking is opt-in to avoid unexpected Cohere API calls in environments
 * without credentials:
 *   - ENABLE_RERANKING must be "true"
 *   - COHERE_API_KEY must be set
 *
 * If either condition is not met, results are returned unchanged (degraded
 * but functional). If the Cohere API call fails at runtime, the error is
 * logged and original results are returned.
 */

import { createCohere } from "@ai-sdk/cohere";
import { rerank } from "ai";

// Module-level flag so the missing-key warning is logged once per process
// rather than once per request (avoids log spam in serverless environments).
let hasWarnedAboutKey = false;

/**
 * Reranks search results using Cohere's rerank-v3.5 cross-encoder model.
 *
 * Results are returned in relevance order with the Cohere relevance score
 * replacing the original similarity score in both `similarityScore` (camelCase,
 * used by domain tools) and `similarity_score` (snake_case, used by the base
 * `searchKnowledgeBase` tool). This ensures the downstream `applyConfidenceThreshold`
 * function picks up the Cohere score regardless of which convention the caller uses.
 *
 * @param query   - The original search query string
 * @param results - Search results; must have a `content` string field
 * @param topN    - Maximum results to return (default 5)
 * @returns       - `{ results, wasReranked }` — results in reranked order if
 *                  reranking was applied, original order otherwise; `wasReranked`
 *                  indicates which threshold set to use downstream
 */
export async function rerankResults<T extends { content: string }>(
  query: string,
  results: T[],
  topN = 5
): Promise<{ results: T[]; wasReranked: boolean }> {
  // Feature flag gate
  if (process.env.ENABLE_RERANKING !== "true") {
    return { results, wasReranked: false };
  }

  // API key gate
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    if (!hasWarnedAboutKey) {
      console.warn(
        "[rerank] COHERE_API_KEY is not set — reranking skipped. " +
          "Set COHERE_API_KEY and ENABLE_RERANKING=true to enable."
      );
      hasWarnedAboutKey = true;
    }
    return { results, wasReranked: false };
  }

  if (results.length === 0) {
    return { results, wasReranked: false };
  }

  const start = performance.now();

  try {
    const cohereProvider = createCohere({ apiKey });

    const { ranking } = await rerank({
      model: cohereProvider.reranking("rerank-v3.5"),
      query,
      documents: results.map((r) => r.content),
      topN,
    });

    const ms = Math.round(performance.now() - start);
    if (process.env.NODE_ENV === "development") {
      console.log(`[rerank] ${results.length} docs reranked in ${ms}ms`);
    }

    // Rebuild results in reranked order, replacing the similarity score with
    // the Cohere relevance score. Both field name conventions are updated so
    // applyConfidenceThreshold works regardless of which tool called us.
    const reranked = ranking.map(({ originalIndex, score }) => ({
      ...results[originalIndex],
      similarityScore: score,
      similarity_score: score,
    })) as T[];

    return { results: reranked, wasReranked: true };
  } catch (err) {
    console.error(
      "[rerank] Cohere API error — falling back to original results:",
      err
    );
    return { results, wasReranked: false };
  }
}
