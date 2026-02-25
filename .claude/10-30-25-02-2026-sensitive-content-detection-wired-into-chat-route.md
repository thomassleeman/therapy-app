# Sensitive Content Detection — Wired into Chat Route

**Date:** 25 February 2026
**File modified:** `app/(chat)/api/chat/route.ts`
**Module used:** `lib/ai/sensitive-content.ts` (pre-existing, not modified)

---

## What Was Done

The pre-built sensitive content detection module was integrated into the main chat API route. The module was already complete and tested; this change wires it into the request lifecycle.

### Changes to `app/(chat)/api/chat/route.ts`

#### 1. Import added (line 20)
```ts
import { detectSensitiveContent } from "@/lib/ai/sensitive-content";
```
Placed in sorted order among `@/lib/ai/` imports — after `providers`, before `tools/`.

#### 2. Detection block (after `effectiveJurisdiction`, before `createUIMessageStream`)
- Extracts the last user message from `uiMessages` by scanning in reverse for `role === "user"`
- Pulls text by filtering `parts` for `{ type: "text" }` blocks and joining them (handles multi-part messages with attachments correctly)
- Calls `detectSensitiveContent(lastUserMessageText)` — a synchronous, keyword-based scan, <1ms, no LLM call

#### 3. Prompt supplement construction
- `sensitiveContentPrompt` is `""` by default (zero impact on benign messages)
- When `detectedCategories.length > 0`, builds a markdown section containing:
  - List of detected categories (formatted as human-readable strings)
  - The `additionalInstructions` from the detection result (safety-critical LLM directives)
  - A `### Required Tool Calls` section with `You MUST call \`{tool}\` with query: "{query}"` directives for each `autoSearchQuery`

#### 4. System prompt append
```ts
system: systemPrompt({ ... }) + sensitiveContentPrompt,
```
Appended at the `streamText` call. When `sensitiveContentPrompt` is `""`, the system prompt is unchanged.

#### 5. Dev logging
```ts
console.log("[sensitive-content] Detected: ...", "| Auto-searches: ...");
```
Logs only when categories are detected. Silent for benign messages.

---

## Behavioural Summary

| Scenario | Effect |
|---|---|
| Benign message (e.g. "CBT for anxiety") | `sensitiveContentPrompt = ""`, system prompt unchanged, no log |
| Safeguarding keyword detected | System prompt gets `## Sensitive Content` section + MUST-call directives for `searchLegislation` |
| Suicidal ideation detected | System prompt gets safety directives + MUST-call directives for `searchGuidelines` / `searchTherapeuticContent` |
| Therapist distress detected | System prompt gets support-oriented directives |
| Multiple categories | All categories combined, all directives included |

---

## Key Design Decisions

- **No pre-invocation of tools** — `autoSearchQueries` are translated into strong natural-language directives in the system prompt. The LLM executes them within the existing `stepCountIs(5)` multi-step budget.
- **Detection is pre-LLM** — runs synchronously before `streamText`, so the full system prompt is ready at call time.
- **No changes to `lib/ai/sensitive-content.ts` or `lib/ai/prompts.ts`** — detection concern is isolated to the route layer.
- **Edge cases handled** — empty messages, attachment-only messages (no text parts), and tool approval flow messages all produce `lastUserMessageText = ""`, which returns a no-op detection result.

---

## Public API of `lib/ai/sensitive-content.ts` (for reference)

```ts
export type SensitiveCategory =
  | "safeguarding"
  | "suicidal_ideation"
  | "therapist_distress";

export interface AutoSearchQuery {
  tool: "searchLegislation" | "searchGuidelines" | "searchTherapeuticContent";
  query: string;
}

export interface SensitiveContentDetection {
  detectedCategories: SensitiveCategory[];
  additionalInstructions: string;   // empty string if no detection
  autoSearchQueries: AutoSearchQuery[];
}

export function detectSensitiveContent(message: string): SensitiveContentDetection;
```
