# Finish Reason Safety Check and SDK Polish

Date: 2026-02-28
Prompt: Prompt 6 — Finish Reason Safety Check and SDK Polish

---

## Overview

Three defensive quality improvements added to catch edge cases the earlier RAG
upgrade prompts didn't cover: blank response detection with real-time fallback
injection, extended usage/finish-reason logging, and comprehensive error
handling in both knowledge-base search tools.

---

## Changes

### 1. Blank response detection and fallback injection

**File:** `app/(chat)/api/chat/route.ts` (lines 235–263)

**Problem:** When the agent exhausts its 6-step budget on tool calls alone and
produces no text, the user sees a permanently blank assistant message bubble —
worse UX than an error message.

**Approach chosen:** After `dataStream.merge(result.toUIMessageStream(...))`,
await `result.text` (along with `totalUsage`, `steps`, `finishReason`) in
parallel. These four properties are `PromiseLike` on `StreamTextResult` and
resolve from internal SDK accumulators — they do not re-consume the stream
already passed to `merge()`. The `execute` callback is still open at this
point (it only closes on return), so `dataStream.write()` is still valid.

If `fullText` is empty or whitespace-only, a `text-start` → `text-delta` →
`text-end` sequence is written directly to the data stream with a generated
UUID as the part ID. This delivers the fallback message to the user's UI in
real-time, not just on next page refresh.

```ts
const [fullText, totalUsage, steps, finishReason] = await Promise.all([
  result.text,
  result.totalUsage,
  result.steps,
  result.finishReason,
]);

if (!fullText || fullText.trim().length === 0) {
  console.warn("[chat] Agent produced no text content — injecting fallback", { chatId: id });
  const fallbackId = generateUUID();
  try {
    dataStream.write({ type: "text-start", id: fallbackId });
    dataStream.write({
      type: "text-delta",
      delta: "I wasn't able to formulate a complete response...",
      id: fallbackId,
    });
    dataStream.write({ type: "text-end", id: fallbackId });
  } catch (err) {
    console.error("[chat] Failed to write fallback text delta:", err);
  }
}
```

**SDK correction discovered:** The prompt suggested `textDelta` as the field
name on the text-delta chunk. The actual AI SDK v6 shape is `delta` (not
`textDelta`). Also requires a preceding `text-start` and following `text-end`
with the same `id` to form a valid text part.

**To test:** Temporarily set `stopWhen: stepCountIs(1)` in
`lib/ai/agents/therapy-reflection-agent.ts` and send a query that triggers a
tool call (e.g. a legislation question). The fallback message should appear in
the UI rather than a blank bubble.

---

### 2. Extended usage and finish reason logging

**File:** `app/(chat)/api/chat/route.ts` (lines 265–280)

Added immediately after the blank-response check, using the same
`Promise.all()` results. Logs after every response:

```ts
console.log("[chat] Response complete:", {
  chatId: id,
  model: selectedChatModel,
  finishReason,          // 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'
  totalSteps: steps.length,
  inputTokens: totalUsage.inputTokens,
  outputTokens: totalUsage.outputTokens,
  totalTokens: totalUsage.totalTokens,
  toolCallCount,         // sum of toolCalls.length across all steps
  hadSensitiveContent: sensitiveContent.detectedCategories.length > 0,
});
```

`toolCallCount` is computed by reducing over `steps` (each step is a
`StepResult` with a `toolCalls` array).

**SDK corrections discovered:**
- Use `result.totalUsage` (not `result.usage`) for multi-step agents. `usage`
  reflects only the last step; `totalUsage` sums across all steps.
- `LanguageModelUsage` properties are `inputTokens` / `outputTokens` /
  `totalTokens` — not `promptTokens` / `completionTokens` (OpenAI naming).
- `createUIMessageStream.onFinish` does NOT expose `usage` or `steps` — those
  are only available on `StreamTextResult` properties or via `ToolLoopAgent`'s
  own `onFinish`. Accessing them in the `execute` callback via `result.*` is
  the correct pattern.

---

### 3. Comprehensive error handling in knowledge-base search tools

**Files:**
- `lib/ai/tools/knowledge-search-tools.ts` (lines 99–308)
- `lib/ai/tools/search-knowledge-base.ts` (lines 141–372)

**Problem:** Both tools had a `try/catch` covering only `parallelSearchAndMerge`
(the Supabase RPC call). Unhandled throws from `reformulateQuery` (OpenAI call),
`rerankResults` (Cohere call), `applyConfidenceThreshold`, and
`routeByConfidence` would propagate uncaught and surface as a stream error
rather than a graceful LLM-readable response.

**Fix:** Added an outer `try/catch` wrapping the entire function body in both
files. The existing inner catch for `parallelSearchAndMerge` is preserved
(it handles the specific case with dev logging). The outer catch handles
everything else.

Error return shape for `executeHybridSearch`:
```ts
{
  results: [],
  error: error instanceof Error ? error.message : "Unexpected search error",
  confidenceTier: "low",
  confidenceNote: "Knowledge base search encountered an unexpected error. Please try again.",
  averageSimilarity: 0,
  maxSimilarity: 0,
  strategy: "graceful_decline" | "general_knowledge",  // based on sensitiveCategories
  message | disclaimer,                                 // matched to strategy
}
```

`searchKnowledgeBase` outer catch additionally includes `result_count: 0`,
`query_used`, and `filters_applied` to match its normal return shape.

**Principle:** No tool execution should ever throw an unhandled error. All
failures return a structured response the LLM can interpret and respond to
gracefully.

---

## SDK Type Reference (AI SDK v6 — verified against node_modules)

| Property | Type | Notes |
|---|---|---|
| `StreamTextResult.text` | `PromiseLike<string>` | Full text from last step |
| `StreamTextResult.totalUsage` | `PromiseLike<LanguageModelUsage>` | Sum across all steps |
| `StreamTextResult.usage` | `PromiseLike<LanguageModelUsage>` | Last step only |
| `StreamTextResult.steps` | `PromiseLike<StepResult[]>` | All agent steps |
| `StreamTextResult.finishReason` | `PromiseLike<FinishReason>` | Final step finish reason |
| `LanguageModelUsage.inputTokens` | `number \| undefined` | Not `promptTokens` |
| `LanguageModelUsage.outputTokens` | `number \| undefined` | Not `completionTokens` |
| `LanguageModelUsage.totalTokens` | `number \| undefined` | |
| `UIMessageStreamWriter.write()` | `(chunk: UIMessageChunk) => void` | |
| `text-delta` chunk shape | `{ type, delta, id }` | Not `textDelta` |
| `createUIMessageStream.onFinish` | `{ messages, finishReason?, isContinuation, isAborted }` | No `usage` or `steps` |

`FinishReason` values: `'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'`

---

## Verification

- `npx tsc --noEmit`: passes (no errors)
- `pnpm lint`: no errors in modified files (23 pre-existing errors in
  `lib/dev/log-writer.ts`, `lib/dev/logger.ts`, `scripts/dev-log-viewer.ts`
  are unrelated to this prompt)
