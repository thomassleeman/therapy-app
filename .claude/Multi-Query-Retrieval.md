# Multi-Query Retrieval

## Problem

The semantic gap between conversational therapist language and formal clinical terminology caused ~20% of retrieval failures. When a therapist says "my client keeps going quiet mid-session", the embedding for that phrasing may not land near chunks about "therapeutic rupture", "client withdrawal", or "metacommunication".

## Solution

An LLM generates 3 clinical reformulations of the original query. All 4 variants (original + 3) are searched in parallel. Results are merged via Reciprocal Rank Fusion (RRF) before the existing reranking and confidence routing steps.

```
Before: query → embed → hybrid_search RPC → rerank → confidence → return

After:  query → reformulateQuery → parallelSearchAndMerge → rerank → confidence → return
                       ↓                      ↓
              [original, r1, r2, r3]   embed+RPC × 4 (parallel)
                                        RRF merge → top N
```

## Files Changed

### New: `lib/ai/query-reformulation.ts`

Exports `reformulateQuery(originalQuery, category, modality): Promise<string[]>`.

- Uses `generateObject` from the AI SDK with `openai('gpt-4o-mini')` at temperature 0.3
- Schema: `{ reformulations: z.array(z.string()).length(3) }`
- Prompt bridges conversational therapist language to clinical terminology in the KB (legislation, professional body guidelines, therapeutic frameworks, clinical practice)
- Returns `[originalQuery, ...reformulations]` — original always included
- Gated behind `ENABLE_QUERY_REFORMULATION=true`. When unset/false, returns `[originalQuery]` immediately (zero overhead, identical to pre-feature behaviour)
- Graceful degradation: if `generateObject` fails, logs the error and returns `[originalQuery]`
- Logs `[reformulate] 3 variants in ${ms}ms`

### New: `lib/ai/parallel-search.ts`

Exports `parallelSearchAndMerge<T extends { id: string }>(queries, searchFn, matchCount): Promise<T[]>`.

- Runs `searchFn` for each query in parallel via `Promise.all`
- Merges results using RRF: `score(doc) = Σ 1 / (60 + rank_i)` where rank is 1-indexed
- Deduplicates by `id` — same chunk from multiple queries gets combined score
- Sorts by combined RRF score descending, returns top `matchCount`
- Decoupled from Supabase — the caller provides a closure, keeping this module pure and testable

### Modified: `lib/ai/tools/knowledge-search-tools.ts`

`executeHybridSearch` updated:

1. Imports `reformulateQuery` and `parallelSearchAndMerge`
2. Calls `reformulateQuery(query, category, modality)` to get query variants
3. Defines `searchFn` closure (embed + RPC per query, using all existing params: `fullTextWeight`, `semanticWeight`, `rrf_k: 60`)
4. Calls `parallelSearchAndMerge(queries, searchFn, matchCount)` — wraps in try/catch; on failure returns the existing error response shape and logs to devLogger
5. Maps merged raw results to camelCase (same as before)
6. Continues: `rerankResults` → `applyConfidenceThreshold` → `routeByConfidence` — unchanged
7. DevLogger `timing.embeddingMs` now holds reformulation time; `timing.searchMs` holds parallel search time

### Modified: `lib/ai/tools/search-knowledge-base.ts`

Same pattern applied to the `execute` function of `searchKnowledgeBase`:

1. Imports `reformulateQuery` and `parallelSearchAndMerge`
2. `reformulateQuery` called with `category ?? null`, `modality ?? null`
3. `searchFn` closure uses the simpler RPC params (no `fullTextWeight`/`semanticWeight`/`rrf_k`)
4. `parallelSearchAndMerge` wraps in try/catch with same error response shape
5. Maps merged raw results to snake_case (same as before)
6. Continues: `rerankResults` → `applyConfidenceThreshold` → `routeByConfidence` — unchanged

### Modified: `.env.example`

Added before the Cohere reranking block:

```env
# ── Multi-query retrieval (optional, reduces vocabulary mismatch failures) ────
# When enabled, an LLM generates 3 clinical reformulations of each search query.
# All variants are searched in parallel and merged via RRF before reranking.
# Adds ~$0.0003 per search invocation (one gpt-4o-mini call) + 3 embedding calls.
ENABLE_QUERY_REFORMULATION=true
```

## Cost (when enabled)

| Component | Cost per search invocation |
|---|---|
| `gpt-4o-mini` reformulation | ~$0.0003 |
| 3 additional embeddings (`text-embedding-3-small`) | ~$0.00003 total |
| 3 additional RPC calls | parallel, latency ≈ slowest single call |
| Reranking (Cohere) | operates on merged pool, filters back to topN |

## Feature Flag Behaviour

| `ENABLE_QUERY_REFORMULATION` | Behaviour |
|---|---|
| `true` | Full multi-query: reformulate → 4× parallel search → RRF merge |
| unset / `false` | `reformulateQuery` returns `[originalQuery]`; `parallelSearchAndMerge` runs a single search — identical to pre-feature behaviour, zero added latency or cost |

## Key Design Decisions

- **`parallelSearchAndMerge` is generic** (`T extends { id: string }`), decoupled from Supabase and independently testable
- **Original query always included** — reformulations augment, never replace
- **RRF k=60** — standard smoothing constant; prevents top-ranked results from dominating when a chunk appears in only one result set
- **Graceful degradation at every layer**: reformulation failure falls back to single-query; parallel search failure returns the standard error response shape unchanged
- **`searchFn` is a closure** — all Supabase/embedding logic stays in the tool files; `parallel-search.ts` has no external dependencies
