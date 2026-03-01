# Cohere Reranking Integration

## Summary

Added Cohere `rerank-v3.5` cross-encoder reranking between hybrid search and confidence thresholding in the therapy RAG pipeline. Reranking evaluates query-document pairs jointly, producing more accurate relevance scores than cosine similarity alone.

---

## Files Changed

### New: `lib/ai/rerank.ts`

Core reranking utility. Exports a single function:

```ts
rerankResults<T extends { content: string }>(
  query: string,
  results: T[],
  topN = 5,
): Promise<{ results: T[]; wasReranked: boolean }>
```

**Behaviour:**
- Gated by two env vars — both must be set for reranking to activate:
  - `ENABLE_RERANKING=true`
  - `COHERE_API_KEY=<key>`
- Uses AI SDK `rerank()` with `cohere.reranking('rerank-v3.5')`
- Returns results in Cohere relevance order with Cohere score written to both `similarityScore` (camelCase, domain tools) and `similarity_score` (snake_case, base tool) so downstream `applyConfidenceThreshold` picks it up regardless of convention
- Graceful degradation: on API error, logs and returns original results unchanged (`wasReranked: false`)
- Missing API key warning is emitted once per process (module-level flag)
- Dev timing log: `[rerank] N docs reranked in Xms`

---

### Modified: `lib/ai/confidence.ts`

**Added constants:**
```ts
export const HIGH_CONFIDENCE_THRESHOLD_RERANKED = 0.7;
export const LOW_CONFIDENCE_THRESHOLD_RERANKED = 0.4;
```
Cohere relevance scores distribute differently to cosine similarity — these starting values are intentionally lower and will be tuned against real query data (Task 5.5).

**Updated `applyConfidenceThreshold` signature:**
```ts
export function applyConfidenceThreshold<T extends ScoredResult>(
  results: T[],
  isReranked = false,   // ← new optional parameter
): ConfidenceAssessment<T>
```
When `isReranked = true`, the reranker-specific thresholds are used internally. Backwards-compatible — existing callers without the second argument continue to use cosine similarity thresholds.

---

### Modified: `lib/ai/tools/knowledge-search-tools.ts`

Added import:
```ts
import { rerankResults } from "@/lib/ai/rerank";
```

In `executeHybridSearch`, between the `mapped` array construction and `applyConfidenceThreshold`:
```ts
const { results: toAssess, wasReranked } = await rerankResults(
  query,
  mapped,
  matchCount,
);
const assessed = applyConfidenceThreshold(toAssess, wasReranked);
```

Updated `console.log` to include `reranked: wasReranked` flag. In development, when reranking is active, also logs `cohereScores` vs `originalScores` for comparison.

Updated `devLogger.logToolCall` raw/filtered results to use `toAssess` (post-rerank ordering).

Covers all four domain tools: `searchLegislation`, `searchGuidelines`, `searchTherapeuticContent`, `searchClinicalPractice`.

---

### Modified: `lib/ai/tools/search-knowledge-base.ts`

Added import:
```ts
import { rerankResults } from "@/lib/ai/rerank";
```

Same pattern as domain tools — after `mapped` construction, before `applyConfidenceThreshold`:
```ts
const { results: toAssess, wasReranked } = await rerankResults(query, mapped);
const assessed = applyConfidenceThreshold(toAssess, wasReranked);
```

Updated `devLogger.logToolCall` to use `toAssess`. Note: this tool's results use snake_case (`similarity_score`) — `rerankResults` handles this by writing the Cohere score to both field name conventions at runtime.

---

### Modified: `.env.example`

Added:
```
# ── Cohere reranking (optional, high-impact RAG quality improvement) ──────────
# Cross-encoder reranking improves retrieval precision significantly.
# Both vars must be set for reranking to activate.
COHERE_API_KEY=<cohere api key>
ENABLE_RERANKING=true
```

---

## Dependency Added

`@ai-sdk/cohere@^3.0.22` — installed via `pnpm add @ai-sdk/cohere`.

---

## Activation

Add to `.env.local`:
```
COHERE_API_KEY=<your key>
ENABLE_RERANKING=true
```

With either variable absent or `ENABLE_RERANKING` not `"true"`, the pipeline behaves identically to before reranking was introduced.

---

## Architecture Notes

- **Integration point**: `rerankResults` sits between hybrid search RPC results and `applyConfidenceThreshold` in both tool files. This is the only place search execution happens, so all five tools benefit automatically.
- **Field normalisation**: `rerankResults` writes Cohere scores to both `similarityScore` and `similarity_score` at runtime. `extractSimilarityScore` in `confidence.ts` already handles both conventions via `result.similarityScore ?? result.similarity_score`.
- **Threshold selection**: `wasReranked` from `rerankResults` is passed directly as `isReranked` to `applyConfidenceThreshold`. No additional logic needed in callers.
- **`topN` alignment**: domain tools pass `matchCount` (default 5) as `topN`; the base tool uses the `rerankResults` default of 5. Both align with `MAX_CONFIDENT_RESULTS = 5`.
