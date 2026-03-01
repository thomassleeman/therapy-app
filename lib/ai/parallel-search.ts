/**
 * Parallel multi-query search with Reciprocal Rank Fusion (RRF) merging.
 *
 * Runs a search function for multiple query variants in parallel and merges
 * results using RRF (k=60). This is the merge step for multi-query retrieval.
 *
 * Decoupled from Supabase — the caller provides a `searchFn` closure that
 * handles embedding + RPC, keeping this module pure and independently testable.
 */

/**
 * Runs `searchFn` for each query in parallel and merges results using
 * Reciprocal Rank Fusion (k=60).
 *
 * - Results are deduplicated by `id` — the same chunk returned by multiple
 *   queries is merged into a single entry with a combined RRF score.
 * - Sort order: combined RRF score descending.
 * - Returns at most `matchCount` results.
 *
 * RRF formula: score(doc) = Σ 1 / (k + rank_i)
 * where rank_i is the 1-indexed position of the doc in result set i,
 * and k=60 is the standard smoothing constant.
 *
 * @param queries    - Array of query strings (original + reformulations)
 * @param searchFn   - Async function that returns ranked results for a single query
 * @param matchCount - Number of top results to return after merging
 */
export async function parallelSearchAndMerge<T extends { id: string }>(
  queries: string[],
  searchFn: (query: string) => Promise<T[]>,
  matchCount: number
): Promise<T[]> {
  const k = 60;

  // Run all queries in parallel — latency is approximately the slowest single call
  const allResults = await Promise.all(queries.map(searchFn));

  // Accumulate RRF scores across all result sets, deduplicating by id
  const scoreMap = new Map<string, { score: number; result: T }>();

  for (const resultSet of allResults) {
    for (let i = 0; i < resultSet.length; i++) {
      const item = resultSet[i];
      // rank is 1-indexed per the RRF formula (i is 0-indexed, so +1)
      const rrfScore = 1 / (k + i + 1);
      const existing = scoreMap.get(item.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(item.id, { score: rrfScore, result: item });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, matchCount)
    .map(({ result }) => result);
}
