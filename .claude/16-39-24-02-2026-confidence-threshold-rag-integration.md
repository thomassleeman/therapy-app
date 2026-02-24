# 2026-02-24 — Confidence Threshold Integration into RAG Search Tools

## What was done

Wired `applyConfidenceThreshold` from `lib/ai/confidence.ts` into both RAG search tool files so that every tool response now carries confidence metadata the LLM can use for hedging decisions.

---

## Files changed

### `lib/ai/tools/knowledge-search-tools.ts`
- Added import: `applyConfidenceThreshold` from `@/lib/ai/confidence`
- **Error return path** — extended with `confidenceTier: "low"`, `confidenceNote`, `averageSimilarity: 0`, `maxSimilarity: 0`
- **Success return path** — results are now mapped first, then passed through `applyConfidenceThreshold`; the return now includes `confidenceTier`, `confidenceNote`, `averageSimilarity`, `maxSimilarity` instead of the raw result array

### `lib/ai/tools/search-knowledge-base.ts`
- Added import: `applyConfidenceThreshold` from `@/lib/ai/confidence`
- **Bug fix** — renamed `parameters` → `inputSchema` in the `tool({...})` call. AI SDK v6's `Tool` type requires `inputSchema`; the wrong key caused all execute parameters to be implicitly `any` (TS7031) and broke overload resolution (TS2769). This was a pre-existing error.
- **Error return path** — extended with full confidence fields plus the missing `result_count`, `query_used`, `filters_applied` to keep the return shape consistent with the success path
- **Success return path** — mapped array passed through `applyConfidenceThreshold`; `result_count` now reflects the post-filter count, not the raw RPC count

---

## Behaviour of `applyConfidenceThreshold`

- Accepts results with either `similarityScore` (camelCase) or `similarity_score` (snake_case)
- Tier determined by **maximum** similarity across all results
- Results below 0.65 are always dropped
- Remaining results sorted by similarity descending, capped at 5
- Low tier → empty results array returned (nothing clinically reliable)
- Returns: `{ results, confidenceTier, confidenceNote, averageSimilarity, maxSimilarity, droppedCount }`

---

## Why this matters

Every tool response (success and error) now includes `confidenceTier` and `confidenceNote`. The system prompt can instruct the LLM to:
- **high** — cite results directly
- **moderate** — cite with hedging language
- **low** — decline to cite, advise the therapist to consult supervision or rephrase

---

## Pre-existing errors not introduced here

Both tool files contain `openai.embedding("text-embedding-3-small", { dimensions: 512 })` which produces TS2554 ("Expected 1 arguments, but got 2") — this is an upstream API change in `@ai-sdk/openai` and was present before this session.
