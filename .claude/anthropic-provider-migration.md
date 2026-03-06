# Migration: Vercel AI Gateway to Direct Anthropic Provider

**Date:** 2026-03-05

## Motivation

For GDPR compliance with special category health data (Article 9 UK GDPR), we need to control the data path between the application and the LLM provider. The Vercel AI Gateway (`@ai-sdk/gateway`) routes requests through Vercel's US-based infrastructure, adding an intermediary hop we cannot control.

Switching to `@ai-sdk/anthropic` eliminates the intermediary and allows us to use Anthropic's EU data residency with a formal Data Processing Agreement.

## Changes Made

### 1. Installed `@ai-sdk/anthropic`

```bash
pnpm add @ai-sdk/anthropic
```

`@ai-sdk/gateway` and `@ai-sdk/openai` were **not** removed — the gateway is still used by `scripts/lib/contextual-enrichment.ts` (offline ingestion), and OpenAI is used for embeddings.

### 2. `lib/ai/models.ts`

- Replaced the multi-provider model list (Anthropic, OpenAI, Google, xAI, reasoning) with two Anthropic-only models:
  - `claude-sonnet-4-5-20250929` (default) — best balance of speed, intelligence, and cost
  - `claude-haiku-4-5-20251001` — fast and affordable
- `DEFAULT_CHAT_MODEL` changed from `"google/gemini-2.5-flash-lite"` to `"claude-sonnet-4-5-20250929"`
- Model IDs are now Anthropic's native identifiers (not gateway-format `anthropic/...`)
- `modelsByProvider` export kept for UI compatibility (single `anthropic` key)

### 3. `lib/ai/providers.ts`

- Replaced `import { gateway } from "@ai-sdk/gateway"` with `import { anthropic } from "@ai-sdk/anthropic"`
- `getLanguageModel()` — uses `anthropic(modelId)` instead of `gateway.languageModel(modelId)`. Reasoning model wrapping with `extractReasoningMiddleware` preserved.
- `getTitleModel()` — changed from `gateway.languageModel("google/gemini-2.5-flash-lite")` to `anthropic("claude-haiku-4-5-20251001")`
- `getArtifactModel()` — changed from `gateway.languageModel("anthropic/claude-haiku-4.5")` to `anthropic("claude-haiku-4-5-20251001")`
- Test environment mock provider path unchanged

### 4. `.claude/CLAUDE.md`

- Updated Tech Stack table (AI and LLM Models rows)
- Updated AI Architecture > Current Setup section
- Updated Environment Variables section to include `ANTHROPIC_API_KEY` and clarify `AI_GATEWAY_API_KEY` is only for ingestion

## Environment Variable Added

```
ANTHROPIC_API_KEY=<anthropic API key>
```

Read automatically by `@ai-sdk/anthropic` — no code-level configuration needed.

## Files NOT Modified

| File | Reason |
|------|--------|
| `scripts/lib/contextual-enrichment.ts` | Offline build script, not processing user data — still uses gateway |
| `scripts/ingest-knowledge.ts` | Uses `@ai-sdk/openai` for embeddings, unrelated |
| `components/multimodal-input.tsx` | Works with updated `models.ts` exports as-is |
| `components/chat.tsx` | Passes model ID string, no provider awareness |
| `app/(chat)/api/chat/route.ts` | Calls `getLanguageModel()` which was updated — route itself unchanged |

## Future Cleanup

- Remove `@ai-sdk/gateway` from dependencies once `scripts/lib/contextual-enrichment.ts` is migrated to use Anthropic directly
- `AI_GATEWAY_API_KEY` env var can be removed at that point
