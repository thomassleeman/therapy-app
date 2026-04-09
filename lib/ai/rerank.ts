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
 * DATA RESIDENCY
 * ──────────────
 * Reranking runs via AWS Bedrock in eu-west-1 (Ireland) using the
 * cohere.rerank-v3-5:0 model — same EU infrastructure as Claude inference
 * and Cohere embeddings. No therapist query text leaves EU infrastructure.
 */

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { rerank } from "ai";

const bedrockFrankfurt = createAmazonBedrock({ region: "eu-central-1" });

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
  if (results.length === 0) {
    return { results, wasReranked: false };
  }

  const start = performance.now();

  try {
    const { ranking } = await rerank({
      // model: bedrock.reranking("cohere.rerank-v3-5:0"),
      model: bedrockFrankfurt.reranking("cohere.rerank-v3-5:0"),
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
      "[rerank] Bedrock reranking error — falling back to original results:",
      err
    );
    return { results, wasReranked: false };
  }
}
