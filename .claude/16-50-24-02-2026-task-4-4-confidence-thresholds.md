# 16:50–24/02/2026 — Task 4.4: Implement Confidence Thresholds

## Summary

Created the confidence threshold system for the therapy RAG pipeline (Task 4.4 from `rag-implementation-helper.md`). This is one of three safety-critical items (alongside 4.6 and 4.7) that must be completed before the system can be used with real therapists.

## Files created

### `lib/ai/confidence.ts` (new file)

Core utility module exporting:

- **`applyConfidenceThreshold<T>(results)`** — Generic function that takes an array of search results with similarity scores and returns a `ConfidenceAssessment` containing filtered results, a confidence tier, and an optional guidance note for the LLM.
- **Three named threshold constants** at the top of the file for easy tuning during Task 5.5:
  - `HIGH_CONFIDENCE_THRESHOLD = 0.80`
  - `LOW_CONFIDENCE_THRESHOLD = 0.65`
  - `MAX_CONFIDENT_RESULTS = 5`
- **Types:** `ConfidenceTier`, `ScoredResult`, `ConfidenceAssessment<T>`

#### Design decisions

- **Tier determined by max similarity score**, not average. If the best result is strong, the query is answerable. If even the best is below 0.65, nothing is reliable.
- **Low tier returns zero results.** Safer to return nothing and refer to supervision than surface misleading clinical content.
- **Results below 0.65 always dropped** even if the overall tier is high — prevents irrelevant trailing chunks.
- **Handles both field name conventions:** `similarityScore` (camelCase, used by domain tools in `knowledge-search-tools.ts`) and `similarity_score` (snake_case, used by base tool in `search-knowledge-base.ts`).
- **Null similarity scores treated as 0** — these come from FTS-only matches where no vector comparison happened.
- **Filtered results sorted by similarity descending** to leverage the "Lost in the Middle" LLM attention pattern.

### `prompt-integrate-confidence-thresholds.md` (coding AI prompt)

A self-contained prompt for a coding AI to wire `applyConfidenceThreshold` into the two existing tool files. Includes:

- The full public API of `lib/ai/confidence.ts`
- The exact current code blocks in both files that need replacing (verbatim)
- The precise replacement code for each
- Error path updates for consistency (so failed searches also return `confidenceTier`/`confidenceNote`)
- A verification checklist

## Files to be modified (not yet modified)

These two files need the integration work described in the prompt above:

### `lib/ai/tools/knowledge-search-tools.ts`

- Add import of `applyConfidenceThreshold` from `@/lib/ai/confidence`
- In `executeHybridSearch`: replace the success return block to map results, call `applyConfidenceThreshold`, and return the assessment fields (`confidenceTier`, `confidenceNote`, `averageSimilarity`, `maxSimilarity`) alongside filtered results
- Extend the error return to include confidence fields for consistency

### `lib/ai/tools/search-knowledge-base.ts`

- Add import of `applyConfidenceThreshold` from `@/lib/ai/confidence`
- In the `execute` function (Step 4): same pattern — map, assess, return with confidence fields
- `result_count` changes from raw count to post-filter count (intentional)
- Extend the error return to include confidence fields

## What this unblocks

- **Task 4.6 (no-results handling):** `buildContextualResponse` consumes the `ConfidenceAssessment` to format context injection — full XML chunks for high, hedged for moderate, supervisor-referral fallback for low.
- **Task 5.5 (parameter tuning):** The three threshold constants are named and centralised for easy adjustment.
- **System prompt update:** The LLM needs instructions to check `confidenceTier` and `confidenceNote` in every tool response. A suggested addition is included in `confidence-integration-guide.md` (project knowledge).

## Current RAG pipeline status after this work

| Task | Status |
|------|--------|
| 4.1 Base KB search tool | ✅ |
| 4.2 Domain-specific tools | ✅ |
| 4.3 Clinical system prompt | ✅ |
| 4.4 Confidence thresholds | ✅ Created, ⏳ integration into tools pending |
| 4.5 Integrate tools into chat route | ✅ |
| 4.6 No-results handling | ❌ Next — depends on 4.4 integration |
| 4.7 Sensitive content detection | ❌ |
