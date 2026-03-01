# ToolLoopAgent Migration

## Summary

Migrated the inline `streamText` configuration in the chat route to a `ToolLoopAgent`, separating agent definition from HTTP handling.

---

## Files Changed

### New: `lib/ai/agents/therapy-reflection-agent.ts`

Agent definition using `ToolLoopAgent` from `ai@6.0.37`.

**Key decisions:**

- `ToolLoopAgentSettings` requires `model` at construction time, even when `prepareCall` overrides it per-request. A placeholder `getLanguageModel(DEFAULT_CHAT_MODEL)` is passed to satisfy the type; `prepareCall` always overrides this with `getLanguageModel(options.selectedChatModel)`.

- `callOptionsSchema` uses Zod to type all per-request context. Runtime-only values (`Session`, `RequestHints`, `dataStream`) use `z.custom<T>()` — this is a typed pass-through with no runtime validation.

- `prepareCall` receives `{ options, ...settings }` where `options` is the typed call options and `settings` are the agent-level defaults (including `stopWhen: stepCountIs(6)`). The spread `...settings` in the return value preserves those defaults, with `model`, `instructions`, `tools`, `providerOptions`, and `experimental_telemetry` overriding them per-request.

- Reasoning/thinking model detection (`isReasoningModel`) moved from the route into `prepareCall`. Anthropic thinking budget (`budgetTokens: 10_000`) is set here.

- All five knowledge search tools (`searchKnowledgeBase`, `searchLegislation`, `searchGuidelines`, `searchTherapeuticContent`, `searchClinicalPractice`) and three document tools (`createDocument`, `updateDocument`, `requestSuggestions`) are registered inside `prepareCall` using the session and dataStream from `options`.

- `activeTools` (previously `experimental_activeTools` in `streamText`) was **not** carried over to the agent. Because `tools` are set dynamically in `prepareCall` rather than at construction time, TypeScript infers `TOOLS = {}`, making `Array<keyof TOOLS>` = `never[]`. Adding `activeTools` to the return causes a type error. The system prompt already contains explicit tool routing instructions, so this restriction is not needed for correctness.

- `TherapyAgentUIMessage` type exported via `InferAgentUIMessage<typeof therapyReflectionAgent>` for future client-side adoption.

---

### Modified: `app/(chat)/api/chat/route.ts`

**Removed imports:**
- `streamText`, `stepCountIs` from `ai`
- `getLanguageModel` from `@/lib/ai/providers`
- `createDocument`, `updateDocument`, `requestSuggestions`, `searchKnowledgeBase`, `knowledgeSearchTools` from `lib/ai/tools/*`
- `isProductionEnvironment` from `@/lib/constants`

**Changed imports:**
- `import { type RequestHints, systemPrompt, type TherapeuticOrientation }` → `import type { RequestHints, TherapeuticOrientation }` (value `systemPrompt` no longer needed in the route; Biome requires `import type` when all imports are type-only)

**Added imports:**
- `import { therapyReflectionAgent } from "@/lib/ai/agents/therapy-reflection-agent"`

**Removed variables:**
- `isReasoningModel` — moved into `prepareCall` inside the agent

**Changed `execute` callback** (inside `createUIMessageStream`):

Before:
```typescript
execute: async ({ writer: dataStream }) => {
  const result = streamText({
    model: getLanguageModel(selectedChatModel),
    system: systemPrompt({ ... }) + sensitiveContentPrompt,
    messages: modelMessages,
    stopWhen: stepCountIs(6),
    experimental_activeTools: isReasoningModel ? [...] : [...],
    providerOptions: isReasoningModel ? { anthropic: { ... } } : undefined,
    tools: { createDocument, updateDocument, requestSuggestions, searchKnowledgeBase, ...knowledgeSearchTools },
    experimental_telemetry: { isEnabled: isProductionEnvironment, functionId: "stream-text" },
  });
  dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
  ...
}
```

After:
```typescript
execute: async ({ writer: dataStream }) => {
  const result = await therapyReflectionAgent.stream({
    messages: modelMessages,
    options: {
      therapeuticOrientation: therapeuticOrientation as TherapeuticOrientation | undefined,
      effectiveModality,
      effectiveJurisdiction,
      sensitiveContentPrompt,
      sensitiveCategories: sensitiveContent.detectedCategories,
      session,
      requestHints,
      selectedChatModel,
      dataStream,
    },
  });
  dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
  ...
}
```

Note: `agent.stream()` is async (returns `Promise<StreamTextResult>`), unlike `streamText()` which is synchronous. The `await` is required.

**Unchanged:**
- `originalMessages: isToolApprovalFlow ? uiMessages : undefined` on `createUIMessageStream` — tool approval flow is handled at the UI stream level, not the agent level
- `onFinish` callback — message saving logic unchanged
- Title generation (`titlePromise`) — unchanged
- Stream resumption (`createUIMessageStreamResponse`, `consumeSseStream`) — unchanged
- Sensitive content detection (`detectSensitiveContent`, `sensitiveContentPrompt` assembly) — unchanged, result passed into agent options

---

## API Notes (`ai@6.0.37`)

- `ToolLoopAgent` constructor requires `model` (not optional)
- `prepareCall` signature: `(options: AgentCallParameters<CALL_OPTIONS> & Pick<ToolLoopAgentSettings, ...>) => MaybePromiseLike<Pick<ToolLoopAgentSettings, ...> & Omit<Prompt, 'system'>>`
- `instructions` is the agent equivalent of `system` in `streamText`
- `activeTools` is the agent equivalent of `experimental_activeTools` in `streamText`, but only accepts `keyof TOOLS` — unusable when tools are set dynamically in `prepareCall`
- `agent.stream()` returns `Promise<StreamTextResult>` — must be awaited before calling `.toUIMessageStream()`
- `InferAgentUIMessage` is exported from `ai` (also aliased as `Experimental_InferAgentUIMessage`)
