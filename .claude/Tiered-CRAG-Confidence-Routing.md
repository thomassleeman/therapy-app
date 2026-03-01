# Tiered CRAG Confidence Routing

## Summary

Implemented CRAG-style tiered routing where confidence level determines system **behaviour**, not just response **framing**. This fixes a critical bug where sensitive content detection combined with empty KB results produced blank LLM responses.

---

## Problem Fixed

When sensitive content was detected (e.g. "risk assessment" triggering `suicidal_ideation`), the system injected `### Required Tool Calls` directives into the system prompt. If the KB had no relevant content, the LLM received contradictory imperatives:

- "You MUST call `searchGuidelines` before responding"
- "Never present ungrounded content"
- (no content returned by the tool)

Result: the LLM exhausted all tool steps searching, produced no text, and the user saw a blank response.

---

## Routing Table

| Tier | Sensitive Categories | Strategy | Behaviour |
|------|---------------------|----------|-----------|
| `high` | any | `grounded` | Use KB results. Cite sources. Full authority. |
| `moderate` | detected | `grounded` | Use KB results with hedging note. Moderate guidance beats nothing for sensitive topics. |
| `moderate` | none | `general_knowledge` | Discard KB results. LLM responds from training knowledge with disclaimer. |
| `low` | detected | `graceful_decline` | No clinical guidance. Supportive acknowledgement + direct to supervisor/professional body. |
| `low` | none | `general_knowledge` | Discard KB results. LLM responds from training knowledge with disclaimer. |

---

## Files Changed

### New: `lib/ai/confidence-router.ts`

Core routing module. Exports:

- **`ConfidenceRoute<T>`** — discriminated union type:
  ```typescript
  | { strategy: "grounded"; results: T[]; confidenceNote: string | null }
  | { strategy: "general_knowledge"; disclaimer: string }
  | { strategy: "graceful_decline"; message: string }
  ```
- **`routeByConfidence(confidenceAssessment, sensitiveCategories)`** — maps confidence tier + sensitive categories to the appropriate strategy
- **`GENERAL_KNOWLEDGE_DISCLAIMER`** — standard disclaimer string for general knowledge responses
- **`buildGracefulDeclineMessage(categories)`** — builds the decline message with interpolated category names (human-readable, e.g. "suicidal ideation" not "suicidal_ideation")
- **`formatSensitiveCategories(categories)`** — helper to format slug arrays to readable strings

### Modified: `lib/ai/tools/knowledge-search-tools.ts`

- Added `sensitiveCategories?: string[]` to `HybridSearchParams`
- `executeHybridSearch` now calls `routeByConfidence` after `applyConfidenceThreshold` and includes `strategy` (plus `disclaimer` or `message`) in its return value
- **Tools moved inside the `knowledgeSearchTools` factory** — previously defined as module-level constants, they are now closures so `sensitiveCategories` can be threaded through to each `execute` function
- Added `sensitiveCategories?: string[]` to `KnowledgeSearchToolsProps`
- Error path also includes `strategy` (routes based on whether sensitive categories are present)

### Modified: `lib/ai/tools/search-knowledge-base.ts`

- Added `sensitiveCategories?: string[]` to `SearchKnowledgeBaseProps`
- Added `routeByConfidence` call after `applyConfidenceThreshold`
- Return value now includes `strategy` + optional `disclaimer`/`message`
- Error path includes strategy routing

### Modified: `app/(chat)/api/chat/route.ts`

- **Removed** the `### Required Tool Calls` section from `sensitiveContentPrompt` — this was the root cause of the blank response bug
- **Kept** `additionalInstructions` (safety-critical behavioural directives like "never rate the client's risk level")
- **Kept** detected categories list in the prompt for LLM awareness
- Passes `sensitiveCategories: sensitiveContent.detectedCategories` to both `searchKnowledgeBase({ ... })` and `knowledgeSearchTools({ ... })`

### Modified: `lib/ai/prompts.ts`

Replaced the "Confidence handling" section (which referenced `confidenceTier` and `confidenceNote`) with a three-strategy "Response strategy" section instructing the LLM to check the `strategy` field in every tool response:

- `grounded` → cite KB results, include hedging if `confidenceNote` present
- `general_knowledge` → respond from training knowledge with explicit disclaimer, no fabricated citations
- `graceful_decline` → do not attempt clinical guidance; acknowledge, explain, direct to supervisor/professional body, offer to help with other aspects

### Modified: `lib/ai/contextual-response.ts`

Added a clarifying comment to the `low` confidence path noting that in the tool-based pipeline this case is now handled upstream by `routeByConfidence`. The `low` path in `buildContextualResponse` is retained for any direct callers and maps to `graceful_decline` behaviour.

---

## Verification

- `pnpm build` passes with no type errors
- `pnpm format` passes (import sort auto-fixed by Biome)
- Pre-existing lint errors in `lib/dev/` and `scripts/` are unrelated to these changes
