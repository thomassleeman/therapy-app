# Post-Generation Faithfulness Verification

## Overview

An async, non-blocking faithfulness check that runs after each grounded RAG response. It evaluates whether the LLM's response is supported by the retrieved knowledge base chunks, saves results to Supabase for monitoring, and logs a warning when the score falls below threshold.

The check **does not block the response stream** — it runs inside `after()` from `next/server`, which executes after the response is fully sent to the client.

---

## Files Created

### `lib/ai/faithfulness-check.ts`

Core faithfulness evaluation module.

**Exports:**
- `FaithfulnessClaimResult` — per-claim verdict: `claim`, `supported`, `sourceChunkId`, `reasoning`
- `FaithfulnessResult` — aggregate result: `claims`, `overallScore` (0–1), `flagged`, `evaluationLatencyMs`
- `FAITHFULNESS_THRESHOLD = 0.7` — responses scoring below this are flagged
- `checkFaithfulness(response, retrievedChunks)` — async function that calls `gpt-4o-mini` via `generateObject`

**Behaviour:**
- Uses `@ai-sdk/openai` with `temperature: 0` for deterministic evaluation
- Only evaluates factual assertions (clinical practice, techniques, legislation, guidelines, ethical obligations) — reflective questions are excluded
- Zero claims → `overallScore = 1.0` (vacuously faithful; a purely reflective response is fine)
- Feature-gated: returns no-op result `{ claims: [], overallScore: 1.0, flagged: false, evaluationLatencyMs: 0 }` when `ENABLE_FAITHFULNESS_CHECK !== "true"`
- Catches `generateObject` errors and returns no-op result (graceful degradation — response is never affected)

---

### `supabase/migrations/20260228000000_create_faithfulness_checks.sql`

Creates the `faithfulness_checks` table:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, auto-generated |
| `chat_id` | `uuid` | FK to `chats(id)`, cascades on delete |
| `message_id` | `text` | Assistant message ID |
| `overall_score` | `numeric(3,2)` | 0.00–1.00 |
| `flagged` | `boolean` | `true` if `overall_score < 0.7` |
| `claims` | `jsonb` | Array of `FaithfulnessClaimResult` objects |
| `evaluation_latency_ms` | `integer` | Time taken for the LLM evaluation call |
| `created_at` | `timestamptz` | Auto-set to `now()` |

Indexes:
- `idx_faithfulness_flagged` — partial index on `flagged = true` for efficient review queries
- `idx_faithfulness_chat` — on `chat_id` for per-chat lookups

Run `pnpm db:push` to apply.

---

### `lib/db/faithfulness.ts`

Database access functions for the faithfulness checks table.

**Exports:**
- `saveFaithfulnessCheck({ chatId, messageId, result })` — inserts a new check record; logs error on failure but does not throw
- `getFlaggedResponses({ limit?, since? })` — returns flagged responses (score < threshold) ordered newest-first, with optional date filter and row limit

---

## Files Modified

### `app/(chat)/api/chat/route.ts`

**Imports added:**
```typescript
import { checkFaithfulness } from "@/lib/ai/faithfulness-check";
import { saveFaithfulnessCheck } from "@/lib/db/faithfulness";
```

**Integration inside `onFinish` callback:**

After messages are saved and dev logging signals are computed, the check:

1. Guards on `ENABLE_FAITHFULNESS_CHECK === "true"`
2. Iterates `finishedMessages` parts, casting each to `Record<string, unknown>` to safely access AI SDK v6's runtime shape (tool parts are typed as `tool-{toolName}` with `state: 'output-available'` and `output` — not the legacy `"tool-invocation"` / `result` shape)
3. Collects chunks from parts where `state === "output-available"` and `output.strategy === "grounded"` — skips `general_knowledge` and `graceful_decline` responses entirely
4. If grounded chunks exist, schedules an `after()` callback that:
   - Calls `checkFaithfulness(responseText, retrievedChunks)`
   - Calls `saveFaithfulnessCheck({ chatId, messageId, result })`
   - Logs `[faithfulness] chatId=... score=... flagged=... latency=...ms`
   - Logs an additional `[faithfulness] FLAGGED response` warning if `result.flagged`

### `.env.example`

Added:
```
# ── Post-generation faithfulness verification ─────────────────────────────────
# When enabled, each grounded response is evaluated asynchronously against the
# retrieved KB chunks using gpt-4o-mini. Results are saved to the
# faithfulness_checks table. Does NOT block the response stream.
# Requires OPENAI_API_KEY to be set.
# ENABLE_FAITHFULNESS_CHECK=true
```

---

## AI SDK v6 Part Shape

A key implementation detail: AI SDK v6 does **not** use the generic `"tool-invocation"` part type from older versions. Tool result parts are:

```typescript
{
  type: `tool-${toolName}`;   // e.g. "tool-searchKnowledgeBase"
  state: 'output-available';  // (not 'result')
  output: unknown;            // the tool's return value (not .result)
  // ...
}
```

The extraction logic casts parts to `Record<string, unknown>` and checks `part.type.startsWith("tool-")` and `part.state === "output-available"` to avoid TypeScript narrowing errors while correctly handling the runtime shape.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENABLE_FAITHFULNESS_CHECK` | No | `false` | Set to `"true"` to activate |
| `OPENAI_API_KEY` | Yes (when enabled) | — | Already required for RAG embeddings |

---

## Routing Logic (What Gets Checked)

| CRAG Strategy | Faithfulness Check Runs? |
|---|---|
| `grounded` | Yes — chunks are available to verify against |
| `general_knowledge` | No — no KB chunks retrieved |
| `graceful_decline` | No — no KB chunks retrieved |

---

## Monitoring

Query flagged responses for review:

```typescript
import { getFlaggedResponses } from "@/lib/db/faithfulness";

// Most recent 50 flagged in the last 7 days
const flagged = await getFlaggedResponses({
  limit: 50,
  since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
});
```

Or query directly in Supabase:

```sql
SELECT chat_id, message_id, overall_score, claims, created_at
FROM faithfulness_checks
WHERE flagged = true
ORDER BY created_at DESC
LIMIT 50;
```
