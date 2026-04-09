# AI Provider Migration History

## Migration 1: Vercel AI Gateway to Direct Anthropic Provider

**Date:** 2026-03-05

### Motivation

For GDPR compliance with special category health data (Article 9 UK GDPR), we need to control the data path between the application and the LLM provider. The Vercel AI Gateway (`@ai-sdk/gateway`) routes requests through Vercel's US-based infrastructure, adding an intermediary hop we cannot control.

Switching to `@ai-sdk/anthropic` eliminated the intermediary and allowed us to use Anthropic's EU data residency with a formal Data Processing Agreement.

### Changes Made

1. **Installed `@ai-sdk/anthropic`** — `@ai-sdk/gateway` and `@ai-sdk/openai` were not removed (used by offline scripts)
2. **`lib/ai/models.ts`** — Replaced multi-provider model list with Anthropic-only models. `DEFAULT_CHAT_MODEL` changed to `"claude-sonnet-4-5-20250929"`
3. **`lib/ai/providers.ts`** — Replaced `gateway.languageModel()` with `anthropic()` calls
4. **`.claude/CLAUDE.md`** — Updated Tech Stack, AI Architecture, and Environment Variables sections

### Environment Variable Added

```
ANTHROPIC_API_KEY=<anthropic API key>
```

---

## Migration 2: Anthropic Direct to AWS Bedrock EU Inference Profiles

**Date:** 2026-04-09

### Motivation

Anthropic's direct API (`@ai-sdk/anthropic`) only offers `"us"` and `"global"` region options — neither provides contractual EU data residency. For GDPR Article 9 special category health data, we need inference to stay within EU infrastructure.

AWS Bedrock offers **EU cross-region inference profiles** (e.g. `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`) that guarantee inference remains within EU regions. Combined with the existing `eu-west-1` (Ireland) Bedrock client configuration already used for Cohere embeddings, this gives us a single AWS-based EU data path for all AI inference.

### Changes Made

#### 1. `lib/ai/models.ts`

- `DEFAULT_CHAT_MODEL` changed from `"claude-sonnet-4-5-20250929"` to `"eu.anthropic.claude-sonnet-4-5-20250929-v1:0"`
- Added `DEFAULT_SMALL_MODEL = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"`

#### 2. `lib/ai/providers.ts`

- Replaced `import { anthropic } from "@ai-sdk/anthropic"` with `import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"`
- All model access now goes through `bedrock(modelId)` with `region: "eu-west-1"` hardcoded
- `getLanguageModel()` — uses `bedrock(modelId)` instead of `anthropic(modelId)`
- Added `getSmallModel()` — centralised Haiku access for query reformulation, faithfulness checks, and diarisation
- `getTitleModel()` and `getArtifactModel()` — now delegate to `getSmallModel()`

#### 3. Production files migrated (6 files)

All production files that previously imported `@ai-sdk/anthropic` directly now route through `lib/ai/providers.ts`:

| File | Before | After |
|------|--------|-------|
| `app/api/notes/generate/route.ts` | `anthropic("claude-sonnet-4-5-20250929")` | `getLanguageModel(DEFAULT_CHAT_MODEL)` |
| `app/api/notes/refine/route.ts` | `anthropic("claude-sonnet-4-5-20250929")` | `getLanguageModel(DEFAULT_CHAT_MODEL)` |
| `app/api/documents/generate/route.ts` | `anthropic("claude-sonnet-4-5-20250929")` | `getLanguageModel(DEFAULT_CHAT_MODEL)` |
| `lib/ai/query-reformulation.ts` | `anthropic("claude-haiku-4-5-20251001")` | `getSmallModel()` |
| `lib/ai/faithfulness-check.ts` | `anthropic("claude-haiku-4-5-20251001")` | `getSmallModel()` |
| `lib/transcription/providers/claude-diarization.ts` | `anthropic("claude-haiku-4-5-20251001")` | `getSmallModel()` |

#### 4. Documentation

- Updated `.claude/CLAUDE.md` — Tech Stack, AI Provider Integration table, GDPR rationale, environment variables
- Created this migration document

### Environment Variable Changes

| Variable | Status |
|----------|--------|
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | **Required** — now used for both Claude inference and Cohere embeddings |
| `ANTHROPIC_API_KEY` | **No longer needed for production** — only used by `scripts/lib/contextual-enrichment.ts` (offline ingestion) |
| `AI_GATEWAY_API_KEY` | **No longer needed for production** — only used by offline ingestion scripts |

### Offline scripts also migrated (2026-04-09)

`scripts/lib/contextual-enrichment.ts` was subsequently migrated from `@ai-sdk/anthropic` to its own `createAmazonBedrock({ region: "eu-west-1" })` instance, using `eu.anthropic.claude-haiku-4-5-20251001-v1:0`. This allowed full removal of both `@ai-sdk/anthropic` and `@ai-sdk/gateway` from `package.json`.

### Packages removed

| Package | Reason |
|---------|--------|
| `@ai-sdk/anthropic` | No longer imported by any source file |
| `@ai-sdk/gateway` | No longer imported by any source file |

### Environment variables no longer needed

| Variable | Status |
|----------|--------|
| `ANTHROPIC_API_KEY` | Can be removed from Vercel env vars and GitHub Actions secrets |
| `AI_GATEWAY_API_KEY` | Can be removed from Vercel env vars |

### Architecture After Migration

All production Claude inference now follows this path:

```
Application code
  -> getLanguageModel() / getSmallModel() (lib/ai/providers.ts)
    -> @ai-sdk/amazon-bedrock (region: eu-west-1)
      -> AWS Bedrock EU inference profile (eu.anthropic.claude-*)
        -> Inference stays within EU infrastructure
```

This mirrors the existing Cohere embedding path (`lib/ai/embedding.ts`), giving a single AWS-based EU data path for all AI operations.
