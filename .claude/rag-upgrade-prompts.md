# RAG Upgrade Implementation Prompts

**Date:** 2026-02-28
**Companion to:** `rag-upgrade-plan.md`
**Usage:** Each section below is a self-contained prompt for a coding AI. Copy the entire section (including context, current code, and requirements) into a fresh coding AI session.

---

## Prompt 1: Cohere Reranking Integration

### Context

This is a Next.js therapy reflection app using the Vercel AI SDK v6 (`ai@6.0.37`), Supabase with pgvector, and TypeScript. The app helps qualified therapists reflect on client sessions using evidence-based clinical guidelines retrieved via RAG.

The RAG pipeline uses hybrid search (vector similarity + full-text search with Reciprocal Rank Fusion) implemented as a Supabase RPC function called `hybrid_search`. After search, results pass through a confidence threshold system (`applyConfidenceThreshold`) that filters by similarity score and assigns a tier (high/moderate/low).

You are adding a **Cohere reranking step** between hybrid search and confidence thresholds. Reranking uses a cross-encoder model that jointly evaluates query-document relevance, producing much more accurate relevance scores than cosine similarity alone. This is the single highest-impact retrieval quality improvement available — research shows that contextual retrieval + hybrid search + reranking achieves 67% fewer retrieval failures than without reranking.

### Tech stack

- Next.js 16 (App Router), TypeScript (strict)
- AI SDK: `ai@6.0.37`, `@ai-sdk/openai@3.0.30`
- Database: Supabase with pgvector
- Linting: Biome (via `ultracite`)
- Package manager: pnpm

### Files involved

**`lib/ai/tools/knowledge-search-tools.ts`** — Contains `executeHybridSearch`, the shared search executor used by all four domain-specific tools (`searchLegislation`, `searchGuidelines`, `searchTherapeuticContent`, `searchClinicalPractice`). This is the only file where search execution happens for the domain tools.

Current `executeHybridSearch` flow:
```typescript
async function executeHybridSearch({
  query,
  category = null,
  modality = null,
  jurisdiction = null,
  matchCount = 5,
  fullTextWeight = 1.0,
  semanticWeight = 1.0,
}: HybridSearchParams) {
  const supabase = await createClient();

  // Generate a 512-dimension embedding using Matryoshka truncation.
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: query,
    providerOptions: {
      openai: { dimensions: 512 },
    },
  });

  const { data, error } = await supabase.rpc("hybrid_search", {
    query_text: query,
    query_embedding: `[${embedding.join(",")}]`,
    match_count: matchCount,
    filter_category: category,
    filter_modality: modality,
    filter_jurisdiction: jurisdiction,
    full_text_weight: fullTextWeight,
    semantic_weight: semanticWeight,
    rrf_k: 60,
  });

  if (error) {
    console.error(`[hybrid_search] ${error.message}`, { category, modality, jurisdiction });
    return {
      results: [],
      error: error.message,
      confidenceTier: "low" as const,
      confidenceNote: "Knowledge base search failed. Please try rephrasing your query.",
      averageSimilarity: 0,
      maxSimilarity: 0,
    };
  }

  const mapped = (data as HybridSearchResult[]).map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    sectionPath: chunk.section_path,
    documentId: chunk.document_id,
    documentTitle: chunk.document_title,
    documentType: chunk.document_type,
    jurisdiction: chunk.jurisdiction,
    modality: chunk.modality,
    metadata: chunk.metadata,
    similarityScore: chunk.similarity_score,
    rrfScore: chunk.combined_rrf_score,
  }));

  const assessed = applyConfidenceThreshold(mapped);

  console.log("[RAG] search results:", {
    resultCount: assessed.results.length,
    confidenceTier: assessed.confidenceTier,
    maxSimilarity: assessed.maxSimilarity,
    titles: mapped.map((r) => r.documentTitle),
  });

  return {
    results: assessed.results,
    confidenceTier: assessed.confidenceTier,
    confidenceNote: assessed.confidenceNote,
    averageSimilarity: assessed.averageSimilarity,
    maxSimilarity: assessed.maxSimilarity,
  };
}
```

The `HybridSearchResult` interface:
```typescript
interface HybridSearchResult {
  id: string;
  content: string;
  document_id: string;
  document_title: string;
  section_path: string | null;
  modality: string | null;
  jurisdiction: string | null;
  document_type: string;
  metadata: Record<string, unknown>;
  similarity_score: number;
  combined_rrf_score: number;
}
```

**`lib/ai/tools/search-knowledge-base.ts`** — Contains the general `searchKnowledgeBase` tool. It has its own inline search execution (does not use `executeHybridSearch`). The same reranking step needs to be added here.

Current search flow in `search-knowledge-base.ts` (relevant portion):
```typescript
const { data, error } = await supabase.rpc("hybrid_search", {
  query_text: query,
  query_embedding: `[${embedding.join(",")}]`,
  match_count: 5,
  filter_category: category ?? null,
  filter_modality: modality ?? null,
  filter_jurisdiction: jurisdiction ?? null,
});

// ... error handling ...

const mapped = ((data as HybridSearchResult[]) ?? []).map((chunk) => ({
  content: chunk.content,
  section_path: chunk.section_path,
  document_title: chunk.document_title,
  document_type: chunk.document_type,
  modality: chunk.modality,
  jurisdiction: chunk.jurisdiction,
  similarity_score: chunk.similarity_score,
  rrf_score: chunk.combined_rrf_score,
  metadata: chunk.metadata,
}));

const assessed = applyConfidenceThreshold(mapped);
```

**`lib/ai/confidence.ts`** — Confidence threshold system. Current thresholds:
```typescript
export const HIGH_CONFIDENCE_THRESHOLD = 0.80;
export const LOW_CONFIDENCE_THRESHOLD = 0.55;
export const MAX_CONFIDENT_RESULTS = 5;
```

These thresholds are calibrated for cosine similarity scores (0–1 range, typically 0.3–0.9 for real queries). Cohere reranker relevance scores have a **different distribution** (also 0–1, but typically cluster differently). The thresholds will need new constants for reranker scores.

### Requirements

1. **Install `@ai-sdk/cohere`** as a dependency.

2. **Create a reranking utility** at `lib/ai/rerank.ts`:
   - Export an async function `rerankResults` that takes a query string, an array of search results (with `id` and `content` fields at minimum), and an optional `topN` parameter (default 5).
   - Use the AI SDK's `rerank` function with `cohere.reranking('rerank-v3.5')`.
   - Pass each result's `content` field as the document text to the reranker.
   - Return the results reordered by Cohere's relevance score, with the Cohere score replacing the `similarityScore` field on each result.
   - Gate behind an environment variable: `COHERE_API_KEY`. If the key is not set, skip reranking and return results unchanged (log a warning once).
   - Also gate behind a feature flag: `ENABLE_RERANKING` env var. If not `"true"`, skip reranking.
   - Add timing: log `[rerank] ${results.length} docs in ${ms}ms` in development.
   - Handle errors gracefully — if the Cohere API fails, log the error and return the original results unchanged (degraded but functional).

3. **Integrate into `executeHybridSearch`** in `knowledge-search-tools.ts`:
   - After the `mapped` array is created (post-RPC, pre-confidence-threshold), call `rerankResults(query, mapped)`.
   - The reranked results replace `mapped` before being passed to `applyConfidenceThreshold`.
   - The `similarityScore` field on each result should now contain the Cohere relevance score (not the original cosine similarity).

4. **Integrate into `search-knowledge-base.ts`**:
   - Same pattern: after mapping RPC results, before `applyConfidenceThreshold`.
   - The base tool's results use `similarity_score` (snake_case). The reranking utility should handle both field name conventions, or you should normalise before calling it.

5. **Add reranker-specific confidence thresholds** to `lib/ai/confidence.ts`:
   - Add new constants: `HIGH_CONFIDENCE_THRESHOLD_RERANKED = 0.70` and `LOW_CONFIDENCE_THRESHOLD_RERANKED = 0.40`.
   - These are starting points — Cohere relevance scores have a different distribution to cosine similarity. They'll be tuned later.
   - Add a boolean parameter `isReranked` to `applyConfidenceThreshold` (default `false`). When `true`, use the reranker thresholds instead of the cosine similarity thresholds.
   - Alternatively, create a separate exported function `getThresholds(isReranked: boolean)` that returns `{ high, low }` and use it internally. Either approach is fine as long as the threshold selection is clean.

6. **Environment variables:**
   - `COHERE_API_KEY` — Required for reranking to work.
   - `ENABLE_RERANKING=true` — Feature flag. When absent or not `"true"`, reranking is skipped entirely.
   - Add both to `.env.example` with comments.

7. **Update logging** — The existing `console.log("[RAG] search results:", ...)` should now include whether reranking was applied and, if so, the reranker scores vs the original similarity scores for comparison during development.

### Verification checklist

- [ ] `pnpm build` passes with no type errors
- [ ] With `ENABLE_RERANKING=false`: behaviour is identical to before (reranking skipped, original scores used)
- [ ] With `ENABLE_RERANKING=true` and valid `COHERE_API_KEY`: results are reranked, Cohere scores appear in tool responses
- [ ] With `ENABLE_RERANKING=true` and invalid `COHERE_API_KEY`: error is logged, original results returned (graceful degradation)
- [ ] Confidence thresholds use reranker-calibrated values when reranking is active
- [ ] All four domain tools (`searchLegislation`, `searchGuidelines`, `searchTherapeuticContent`, `searchClinicalPractice`) and the base `searchKnowledgeBase` tool all benefit from reranking (since they all flow through the two integration points)
- [ ] Biome lint passes (`pnpm lint`)

---

## Prompt 2: Tiered CRAG Confidence Routing

### Context

This is a Next.js therapy reflection app using the Vercel AI SDK v6, Supabase with pgvector, and TypeScript. The app helps qualified therapists reflect on client sessions using RAG.

The current confidence system (`lib/ai/confidence.ts`) assigns tiers (high/moderate/low) that affect how the LLM *frames* its response (hedging language, supervisor referral). But the tier doesn't change *what the system does* — all tiers still try to answer from KB content, and low confidence still returns empty results with a note.

This has caused a critical bug: when sensitive content is detected (e.g. "risk assessment" triggers the suicidal_ideation keyword), the system injects MUST-search directives into the system prompt. If the KB has no content (or search returns low-confidence results), the LLM receives contradictory imperatives — "you MUST cite knowledge base content" AND "never present ungrounded content" AND no content exists. Result: the LLM spends all its tool steps searching, produces no text, and the user sees a blank response.

You are implementing **CRAG-style tiered routing** where confidence level determines system *behaviour*, not just response *framing*:

| Tier | Condition | Behaviour |
|------|-----------|-----------|
| **Grounded** | High confidence results exist | Use KB results. Cite sources. Full authority. |
| **General knowledge** | Moderate confidence OR low confidence on non-sensitive topic | Discard KB results. LLM responds from training knowledge. Clearly labelled as general guidance, not from the knowledge base. No citations. |
| **Graceful decline** | Low confidence AND sensitive topic detected | Don't attempt clinical guidance. Supportive acknowledgement + direct to supervisor/safeguarding lead. |

**This is not a medical device.** Therapists are qualified professionals who can evaluate information critically. The "general knowledge" tier is appropriate because the LLM's training data includes substantial clinical knowledge — it just needs clear labelling. The "graceful decline" tier only applies to the narrow category of sensitive topics where getting it wrong has disproportionate consequences.

### Tech stack

- Next.js 16 (App Router), TypeScript (strict)
- AI SDK: `ai@6.0.37`
- Linting: Biome (via `ultracite`)
- Package manager: pnpm

### Current files and their roles

**`lib/ai/confidence.ts`** — Existing confidence threshold system. Exports:
- `applyConfidenceThreshold<T>(results, isReranked?)` → `ConfidenceAssessment<T>`
- `ConfidenceTier` type: `"high" | "moderate" | "low"`
- `ConfidenceAssessment<T>`: `{ results, confidenceTier, confidenceNote, averageSimilarity, maxSimilarity, droppedCount }`
- Threshold constants: `HIGH_CONFIDENCE_THRESHOLD`, `LOW_CONFIDENCE_THRESHOLD`, `MAX_CONFIDENT_RESULTS` (plus reranked variants from Prompt 1)

**`lib/ai/contextual-response.ts`** — Formats confidence-assessed results into XML context for the LLM. Exports:
- `buildContextualResponse(options)` → `{ contextString, confidenceTier, chunksInjected, hasQualification }`
- Has three paths: high (full XML), moderate (XML + hedging preamble), low (supervisor referral message)

**`lib/ai/sensitive-content.ts`** — Keyword-based detection run pre-LLM. Exports:
- `detectSensitiveContent(text)` → `{ detectedCategories: string[], additionalInstructions: string, autoSearchQueries: { tool, query }[] }`
- Categories: `"safeguarding"`, `"suicidal_ideation"`, `"therapist_distress"`

**`app/(chat)/api/chat/route.ts`** — Chat route. Currently:
1. Runs `detectSensitiveContent` on the last user message
2. Builds `sensitiveContentPrompt` with MUST-search directives if categories detected
3. Appends to system prompt: `systemPrompt({ ... }) + sensitiveContentPrompt`
4. Calls `streamText` with tools and `stopWhen: stepCountIs(6)`

The sensitive content prompt currently contains a `### Required Tool Calls` section:
```
You MUST make the following search calls before responding, in addition to any other searches you decide are relevant:
- You MUST call the `searchGuidelines` tool with query: "risk assessment framework suicide self-harm"
```

**`lib/ai/prompts.ts`** — System prompt. The `therapyReflectionPrompt` string includes a "Knowledge Base & Search Behaviour" section with search-first rules, citation rules, and confidence handling instructions that currently say:
```
**Confidence handling:**
- Check the `confidenceTier` and `confidenceNote` in every tool response
- **High confidence:** Cite and reference freely
- **Moderate confidence:** Include the hedging language from `confidenceNote` and acknowledge limitations
- **Low confidence / no results:** Do not guess. Acknowledge the gap honestly and recommend consulting a clinical supervisor or the relevant professional body directly
```

### Requirements

1. **Create `lib/ai/confidence-router.ts`** — New module that determines the response strategy.

   Export a discriminated union type:
   ```typescript
   export type ConfidenceRoute<T> =
     | { strategy: 'grounded'; results: T[]; confidenceNote: string | null; }
     | { strategy: 'general_knowledge'; disclaimer: string; }
     | { strategy: 'graceful_decline'; message: string; };
   ```

   Export a function:
   ```typescript
   export function routeByConfidence<T>(
     confidenceAssessment: ConfidenceAssessment<T>,
     sensitiveCategories: string[],
   ): ConfidenceRoute<T>
   ```

   Routing logic:
   - `confidenceTier === "high"` → always `grounded`
   - `confidenceTier === "moderate"` AND `sensitiveCategories.length > 0` → `grounded` (for sensitive topics, moderate KB guidance is better than nothing — use it with hedging)
   - `confidenceTier === "moderate"` AND `sensitiveCategories.length === 0` → `general_knowledge`
   - `confidenceTier === "low"` AND `sensitiveCategories.length > 0` → `graceful_decline`
   - `confidenceTier === "low"` AND `sensitiveCategories.length === 0` → `general_knowledge`

   The `general_knowledge` disclaimer: `"I don't have specific guidance on this in the knowledge base. The following is based on general clinical knowledge and should not be treated as verified platform guidance. Always consult your supervisor for case-specific decisions."`

   The `graceful_decline` message: `"This is an important question that touches on [detected categories]. The platform's knowledge base doesn't yet contain specific guidance to ground a reliable response on this topic. I'd recommend discussing this with your clinical supervisor, safeguarding lead, or contacting your professional body (BACP, UKCP, IACP) directly for authoritative guidance. I'm happy to help with other aspects of your reflection on this case."`
   - Interpolate the detected categories (formatted human-readable, e.g. "suicidal ideation" not "suicidal_ideation") into the message.

2. **Integrate routing into search tools** — Both `executeHybridSearch` and `search-knowledge-base.ts` should include the route in their return values.

   In `lib/ai/tools/knowledge-search-tools.ts`:
   - Add `sensitiveCategories?: string[]` to `HybridSearchParams`.
   - After `applyConfidenceThreshold`, call `routeByConfidence(assessed, sensitiveCategories ?? [])`.
   - Add `strategy` to the return value (the discriminated union's `strategy` field: `"grounded"`, `"general_knowledge"`, or `"graceful_decline"`).
   - When strategy is `general_knowledge`, still return the `disclaimer` string.
   - When strategy is `graceful_decline`, still return the `message` string.

   In the `knowledgeSearchTools` factory:
   - Add `sensitiveCategories?: string[]` to `KnowledgeSearchToolsProps`.
   - Thread it through to each tool's `execute` function as a closure variable passed into `executeHybridSearch`.

   In `search-knowledge-base.ts`:
   - Same pattern: add `sensitiveCategories` parameter, route after confidence, include strategy in return.

3. **Modify the chat route** (`app/(chat)/api/chat/route.ts`):

   **Refactor sensitive content handling:**
   - Still run `detectSensitiveContent` before `streamText`.
   - **Remove the `### Required Tool Calls` section** from `sensitiveContentPrompt`. These MUST-call directives are the root cause of the blank response bug.
   - **Keep the `additionalInstructions`** from the detection result (safety-critical behavioural directives like "never rate the client's risk level"). These are still valuable.
   - Keep the detected categories list in the prompt (for LLM awareness).
   - Pass `sensitiveCategories` into the tool factories:
     ```typescript
     ...knowledgeSearchTools({ session, sensitiveCategories: sensitiveContent.detectedCategories }),
     searchKnowledgeBase({ session, sensitiveCategories: sensitiveContent.detectedCategories }),
     ```

4. **Update system prompt** in `lib/ai/prompts.ts`:

   Replace the existing "Confidence handling" section with:
   ```
   **Response strategy (check `strategy` field in every tool response):**

   - **`grounded`**: The knowledge base returned relevant results. Use them as your primary source. Follow citation rules above. If `confidenceNote` is present, include its hedging language.

   - **`general_knowledge`**: The knowledge base didn't have relevant content for this query. You may respond using your general clinical training knowledge, but you MUST:
     1. Begin with a clear statement like "I don't have specific platform guidance on this, but from general clinical practice..."
     2. Never fabricate citations or imply knowledge base sourcing
     3. Keep the response helpful — the therapist is a qualified professional who can evaluate general guidance critically
     4. Recommend consulting their supervisor or professional body for authoritative guidance

   - **`graceful_decline`**: The query involves a sensitive topic and no reliable knowledge base content was found. Do NOT attempt clinical guidance from general knowledge. Instead:
     1. Acknowledge the therapist's question and validate its importance
     2. Explain that the platform doesn't yet have specific guidance on this topic
     3. Direct them to their clinical supervisor, safeguarding lead, or professional body
     4. Offer to help with other aspects of their case reflection
   ```

5. **Update `lib/ai/contextual-response.ts`** — Add awareness of the routing strategy. If the tool already returns `strategy` in its response and the LLM handles it via system prompt instructions, `buildContextualResponse` may not need major changes. But ensure the `low` tier path doesn't conflict with the router's `general_knowledge` path (previously, low tier always meant supervisor referral; now low + non-sensitive = general knowledge).

### Verification checklist

- [ ] `pnpm build` passes with no type errors
- [ ] **Blank response bug is fixed**: sensitive content detected + empty KB → therapist sees a supportive decline message, NOT a blank response
- [ ] Non-sensitive query + low confidence → general knowledge response with clear disclaimer
- [ ] Non-sensitive query + moderate confidence → general knowledge response with disclaimer
- [ ] Sensitive query + moderate confidence → grounded response with hedging (uses moderate results)
- [ ] High confidence → grounded response with citations (no regression)
- [ ] MUST-search directives removed from sensitive content prompt
- [ ] `additionalInstructions` (safety rules) preserved in sensitive content prompt
- [ ] All tool responses include `strategy` field
- [ ] System prompt updated with three-strategy instructions
- [ ] Biome lint passes (`pnpm lint`)

---

## Prompt 3: ToolLoopAgent Migration

### Context

This is a Next.js therapy reflection app using the Vercel AI SDK v6 (`ai@6.0.37`), Supabase, and TypeScript. The app uses `streamText` with tools and `stepCountIs(6)` for multi-step tool calling.

Currently, the chat route at `app/(chat)/api/chat/route.ts` configures everything inline: model selection, system prompt assembly (including therapeutic orientation, modality, jurisdiction, sensitive content injection), tool registration, step limits, and streaming. This works but makes the route handler large and couples agent logic with HTTP handling.

AI SDK 6 introduced `ToolLoopAgent` — a composable abstraction that separates agent definition from invocation. You are migrating the current inline configuration to a `ToolLoopAgent` with `prepareCall` for per-request customisation.

### Tech stack

- Next.js 16 (App Router), TypeScript (strict)
- AI SDK: `ai@6.0.37`, `@ai-sdk/openai@3.0.30`, `@ai-sdk/gateway@3.0.15`
- Linting: Biome (via `ultracite`)
- Package manager: pnpm

### Current chat route structure

The relevant portion of `app/(chat)/api/chat/route.ts`:

```typescript
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";

// ... inside POST handler, inside createUIMessageStream execute callback:

const result = streamText({
  model: getLanguageModel(selectedChatModel),
  system:
    systemPrompt({
      selectedChatModel,
      requestHints,
      therapeuticOrientation: therapeuticOrientation as TherapeuticOrientation | undefined,
      effectiveModality,
      effectiveJurisdiction,
    } as Parameters<typeof systemPrompt>[0]) + sensitiveContentPrompt,
  messages: modelMessages,
  stopWhen: stepCountIs(6),
  providerOptions: selectedChatModel.includes("thinking")
    ? { anthropic: { thinking: { type: "enabled", budgetTokens: 10_000 } } }
    : undefined,
  tools: {
    createDocument: createDocument({ session, dataStream }),
    updateDocument: updateDocument({ session, dataStream }),
    requestSuggestions: requestSuggestions({ session, dataStream }),
    searchKnowledgeBase: searchKnowledgeBase({ session }),
    ...knowledgeSearchTools({ session }),
  },
  experimental_telemetry: {
    isEnabled: isProductionEnvironment,
    functionId: "stream-text",
  },
});

dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
```

The `systemPrompt` function in `lib/ai/prompts.ts`:
```typescript
export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  therapeuticOrientation,
  effectiveModality,
  effectiveJurisdiction,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  therapeuticOrientation?: TherapeuticOrientation;
  effectiveModality?: string | null;
  effectiveJurisdiction?: string | null;
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);
  const orientationPrompt = getOrientationPrompt(therapeuticOrientation);
  const toolContextPrompt = getToolContextPrompt(effectiveModality, effectiveJurisdiction);

  if (selectedChatModel.includes("reasoning") || selectedChatModel.includes("thinking")) {
    return `${therapyReflectionPrompt}${orientationPrompt}${toolContextPrompt}\n\n${requestPrompt}`;
  }

  return `${therapyReflectionPrompt}${orientationPrompt}${toolContextPrompt}\n\n${requestPrompt}\n\n${artifactsPrompt}`;
};
```

The `getLanguageModel` function in `lib/ai/providers.ts` maps model IDs to AI SDK model instances using `@ai-sdk/gateway`.

Tool factories accept `{ session }` or `{ session, dataStream }` depending on whether they need to write to the UI stream. The `sensitiveCategories` parameter was added in Prompt 2.

### Requirements

1. **Create `lib/ai/agents/therapy-reflection-agent.ts`** — The agent definition.

   Import `ToolLoopAgent`, `stepCountIs`, and `InferAgentUIMessage` from `ai`.

   Define a `callOptionsSchema` using Zod that covers all per-request context:
   ```typescript
   const callOptionsSchema = z.object({
     // Therapeutic context
     therapeuticOrientation: z.custom<TherapeuticOrientation>().optional(),
     effectiveModality: z.string().nullable().optional(),
     effectiveJurisdiction: z.string().nullable().optional(),
     // Sensitive content (already processed by the route)
     sensitiveContentPrompt: z.string().default(""),
     sensitiveCategories: z.array(z.string()).default([]),
     // Session for tool factories
     session: z.custom<Session>(),
     // Request hints for system prompt
     requestHints: z.custom<RequestHints>(),
     // Model selection
     selectedChatModel: z.string(),
     // dataStream for document tools
     dataStream: z.custom<any>(),
   });
   ```

   Use `prepareCall` to assemble the system prompt and tools dynamically per request:
   ```typescript
   prepareCall: ({ options, ...settings }) => {
     const fullSystemPrompt = systemPrompt({
       selectedChatModel: options.selectedChatModel,
       requestHints: options.requestHints,
       therapeuticOrientation: options.therapeuticOrientation,
       effectiveModality: options.effectiveModality,
       effectiveJurisdiction: options.effectiveJurisdiction,
     }) + options.sensitiveContentPrompt;

     return {
       ...settings,
       model: getLanguageModel(options.selectedChatModel),
       instructions: fullSystemPrompt,
       tools: {
         createDocument: createDocument({ session: options.session, dataStream: options.dataStream }),
         updateDocument: updateDocument({ session: options.session, dataStream: options.dataStream }),
         requestSuggestions: requestSuggestions({ session: options.session, dataStream: options.dataStream }),
         searchKnowledgeBase: searchKnowledgeBase({
           session: options.session,
           sensitiveCategories: options.sensitiveCategories,
         }),
         ...knowledgeSearchTools({
           session: options.session,
           sensitiveCategories: options.sensitiveCategories,
         }),
       },
       providerOptions: options.selectedChatModel.includes("thinking")
         ? { anthropic: { thinking: { type: "enabled", budgetTokens: 10_000 } } }
         : undefined,
     };
   },
   ```

   Set `stopWhen: stepCountIs(6)`.

   Export the agent instance and the inferred UI message type:
   ```typescript
   export const therapyReflectionAgent = new ToolLoopAgent({ ... });
   export type TherapyAgentUIMessage = InferAgentUIMessage<typeof therapyReflectionAgent>;
   ```

2. **Simplify `app/(chat)/api/chat/route.ts`**:

   The route should now:
   1. Parse request, authenticate, resolve chat (unchanged)
   2. Resolve therapeutic context — orientation, modality, jurisdiction (unchanged)
   3. Run sensitive content detection (unchanged)
   4. Build `sensitiveContentPrompt` (unchanged, minus the MUST-search directives removed in Prompt 2)
   5. Create the UI message stream
   6. Inside the stream's `execute` callback, call the agent:
      ```typescript
      const result = therapyReflectionAgent.stream({
        messages: modelMessages,
        options: {
          therapeuticOrientation,
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
      ```
   7. Handle title generation and message saving as before

   Remove inline `streamText` configuration, `stepCountIs` import (unless used elsewhere), `providerOptions` construction, and individual tool imports from the route. The route should import only the agent and the `createUIMessageStream` / `createUIMessageStreamResponse` helpers.

3. **Preserve all existing behaviour:**
   - Reasoning model detection and Anthropic thinking budget → handled in `prepareCall`
   - Tool approval flow (`isToolApprovalFlow`) → may need special handling. Check whether `ToolLoopAgent` supports `originalMessages` for tool approval. If not, keep the tool approval path using inline `streamText` and only migrate the standard path.
   - Telemetry configuration → add `experimental_telemetry` in `prepareCall`'s return
   - Message saving in `onFinish` → unchanged, stays in the route
   - Title generation → unchanged, stays in the route
   - Stream resumption → unchanged

4. **Export `TherapyAgentUIMessage`** from the agent file. The client's `useChat` hook doesn't need to change now, but the type should be available for future adoption.

### Verification checklist

- [ ] `pnpm build` passes with no type errors
- [ ] Agent definition lives in `lib/ai/agents/therapy-reflection-agent.ts`
- [ ] Route handler is significantly shorter — agent handles model, prompt, tools, step limit
- [ ] Sensitive content detection still works (prompt appended via agent options)
- [ ] All five search tools still function
- [ ] Document tools (create, update, suggestions) still function with dataStream
- [ ] Reasoning models still get Anthropic thinking configuration
- [ ] Tool approval flow still works (either via agent or kept as inline fallback)
- [ ] Message saving still works
- [ ] Title generation still works
- [ ] `TherapyAgentUIMessage` type is exported
- [ ] Biome lint passes (`pnpm lint`)

---

## Prompt 4: Multi-Query Retrieval

### Context

This is a Next.js therapy reflection app using the Vercel AI SDK v6, Supabase with pgvector, and TypeScript. The RAG pipeline uses hybrid search with optional Cohere reranking (from Prompt 1).

The semantic gap between therapist language and clinical terminology is a major retrieval failure mode. When a therapist says "my client keeps going quiet mid-session", the embedding for that phrasing may not land near chunks about "therapeutic rupture", "client withdrawal", or "metacommunication". Research shows ~20% of retrieval failures are caused by vocabulary mismatch.

You are adding **multi-query retrieval**: an LLM generates 2–3 clinical reformulations of the therapist's query, all variants are searched in parallel, and results are merged via RRF before reranking.

### Tech stack

- Next.js 16 (App Router), TypeScript (strict)
- AI SDK: `ai@6.0.37`, `@ai-sdk/openai@3.0.30`
- Database: Supabase with pgvector
- Linting: Biome (via `ultracite`)
- Package manager: pnpm

### Current search flow in `executeHybridSearch`

After Prompt 1:
```
query → embed → hybrid_search RPC → rerank (Cohere) → applyConfidenceThreshold → return
```

### Requirements

1. **Create `lib/ai/query-reformulation.ts`**:

   Export an async function:
   ```typescript
   export async function reformulateQuery(
     originalQuery: string,
     category: string | null,
     modality: string | null,
   ): Promise<string[]>
   ```

   Use `generateObject` from `ai` with `openai('gpt-4o-mini')`:

   Schema:
   ```typescript
   z.object({
     reformulations: z.array(z.string()).length(3).describe(
       "Three reformulations using clinical terminology that therapeutic framework documents and professional guidelines would use"
     ),
   })
   ```

   Prompt (include this verbatim or closely):
   ```
   You are a clinical terminology expert helping bridge the gap between conversational therapist language and formal clinical knowledge base content.

   Given a therapist's search query, generate exactly 3 reformulations that might match content in a clinical knowledge base containing:
   - Legislation briefings (UK Data Protection Act, GDPR, Mental Health Act, Children Act, Care Act)
   - Professional body guidelines (BACP, UKCP, HCPC, IACP ethical frameworks)
   - Therapeutic framework guidance (CBT techniques, person-centred approaches, psychodynamic concepts)
   - Clinical practice guidance (documentation, note-taking, treatment planning)

   ${category ? `Content category: ${category}` : ""}
   ${modality ? `Therapeutic modality: ${modality}` : ""}
   Original query: "${originalQuery}"

   Generate 3 reformulations. Each should:
   1. Use different clinical vocabulary while preserving the original intent
   2. Include formal diagnostic, therapeutic, or legal terminology where appropriate
   3. Be the kind of phrase that would appear as a heading or key phrase in clinical guidelines

   Examples of the kind of reformulation needed:
   - "client went quiet" → "therapeutic rupture withdrawal metacommunication"
   - "when can I break confidentiality" → "mandatory disclosure exceptions confidentiality limits"
   - "client keeps cancelling" → "therapeutic resistance avoidance attendance engagement"
   ```

   Set temperature to 0.3.

   Return `[originalQuery, ...reformulations]` — always include the original.

   Gate behind `ENABLE_QUERY_REFORMULATION=true` env var. When disabled, return `[originalQuery]`.

   Handle errors gracefully: if `generateObject` fails, log and return `[originalQuery]`.

   Add timing: log `[reformulate] 3 variants in ${ms}ms`.

2. **Create `lib/ai/parallel-search.ts`**:

   Export an async function:
   ```typescript
   export async function parallelSearchAndMerge(
     queries: string[],
     searchFn: (query: string) => Promise<HybridSearchResult[]>,
     matchCount: number,
   ): Promise<HybridSearchResult[]>
   ```

   This function:
   - Calls `searchFn` for each query in parallel using `Promise.all`
   - Merges results using Reciprocal Rank Fusion:
     - Each result identified by `id` field
     - RRF score per result = `sum(1 / (k + rank))` across all query result sets, where k=60 and rank is 1-indexed position
     - If a result wasn't returned by a query, it contributes 0 to that query's RRF component
   - Deduplicates (same `id` from multiple queries merged, not duplicated)
   - Sorts by combined RRF score descending
   - Returns top `matchCount` results

   The `searchFn` parameter keeps this function decoupled from Supabase — the caller provides a closure that handles embedding + RPC.

3. **Integrate into `executeHybridSearch`** in `knowledge-search-tools.ts`:

   New flow:
   ```
   query → reformulateQuery → parallelSearchAndMerge → [rerank] → applyConfidenceThreshold → return
   ```

   The `searchFn` closure for each query variant:
   ```typescript
   const searchFn = async (q: string) => {
     const { embedding } = await embed({
       model: openai.embedding("text-embedding-3-small"),
       value: q,
       providerOptions: { openai: { dimensions: 512 } },
     });
     const { data, error } = await supabase.rpc("hybrid_search", {
       query_text: q,
       query_embedding: `[${embedding.join(",")}]`,
       match_count: matchCount,
       filter_category: category,
       filter_modality: modality,
       filter_jurisdiction: jurisdiction,
       full_text_weight: fullTextWeight,
       semantic_weight: semanticWeight,
       rrf_k: 60,
     });
     if (error) throw error;
     return data as HybridSearchResult[];
   };
   ```

   When reformulation is disabled, `reformulateQuery` returns `[originalQuery]`, so `parallelSearchAndMerge` runs a single query — identical to current behaviour.

   Update logging to show query variants and merged result count.

4. **Also integrate into `search-knowledge-base.ts`** — Same pattern.

5. **Environment variables:**
   - `ENABLE_QUERY_REFORMULATION=true` — Feature flag.
   - Add to `.env.example` with comment.

6. **Add comments noting cost:**
   - One `gpt-4o-mini` call per search tool invocation (~$0.0003)
   - 3 additional embedding calls (~$0.00001 each)
   - 3 additional RPC calls (parallel, so latency ≈ slowest single call)
   - Reranking downstream filters expanded pool back to topN

### Verification checklist

- [ ] `pnpm build` passes with no type errors
- [ ] With `ENABLE_QUERY_REFORMULATION=false`: behaviour identical to before
- [ ] With `ENABLE_QUERY_REFORMULATION=true`: reformulated queries logged, parallel search executed, results merged
- [ ] Deduplication works: same chunk from multiple queries appears once with combined score
- [ ] RRF merge produces sensible ordering
- [ ] Reranking (if enabled) runs after merge, before confidence thresholds
- [ ] Graceful degradation: if reformulation fails, falls back to single-query search
- [ ] Biome lint passes (`pnpm lint`)

---

## Prompt 5: Post-Generation Faithfulness Verification

### Context

This is a Next.js therapy reflection app using the Vercel AI SDK v6, Supabase, and TypeScript. The RAG pipeline retrieves clinical content and the LLM generates grounded responses.

Even with good retrieval and reranking, the LLM can drift from sources — paraphrasing clinical terminology, synthesising across chunks in misleading ways, or subtly hallucinating details. You are adding a **post-generation faithfulness check** that runs asynchronously after `streamText` completes, evaluates whether the response is supported by the retrieved chunks, and logs results for monitoring.

This check **does NOT block the response stream**. It runs in the background and logs to a database table for review.

### Tech stack

- Next.js 16 (App Router), TypeScript (strict)
- AI SDK: `ai@6.0.37`, `@ai-sdk/openai@3.0.30`
- Database: Supabase
- Linting: Biome (via `ultracite`)
- Package manager: pnpm

### Requirements

1. **Create `lib/ai/faithfulness-check.ts`**:

   Export types:
   ```typescript
   export interface FaithfulnessClaimResult {
     claim: string;
     supported: boolean;
     sourceChunkId: string | null;
     reasoning: string;
   }

   export interface FaithfulnessResult {
     claims: FaithfulnessClaimResult[];
     overallScore: number; // 0–1, proportion of supported claims
     flagged: boolean;     // true if overallScore < FAITHFULNESS_THRESHOLD
     evaluationLatencyMs: number;
   }

   export const FAITHFULNESS_THRESHOLD = 0.7;
   ```

   Export an async function:
   ```typescript
   export async function checkFaithfulness(
     response: string,
     retrievedChunks: { id: string; content: string; documentTitle: string }[],
   ): Promise<FaithfulnessResult>
   ```

   Use `generateObject` from `ai` with `openai('gpt-4o-mini')` and `temperature: 0`.

   Schema:
   ```typescript
   z.object({
     claims: z.array(z.object({
       claim: z.string().describe("A single factual claim extracted from the AI response"),
       supported: z.boolean().describe("Whether this claim is directly supported by the source chunks"),
       sourceChunkId: z.string().nullable().describe("ID of the supporting chunk, or null"),
       reasoning: z.string().describe("Brief explanation of the support/non-support verdict"),
     })),
   })
   ```

   Prompt:
   ```
   You are a clinical accuracy auditor for a therapy reflection platform. Given an AI-generated response and the source chunks it was based on, evaluate whether each factual claim in the response is supported by the source material.

   A claim is "supported" if the source material directly states or clearly implies the same information. A claim is "unsupported" if it goes beyond what the sources say, contradicts the sources, or introduces information not present in any source.

   Ignore reflective questions (these are the agent's core function and don't need source support). Only evaluate factual assertions about clinical practice, therapeutic techniques, legislation, professional guidelines, or ethical obligations.

   SOURCE CHUNKS:
   ${retrievedChunks.map(c => `[${c.id}] (${c.documentTitle}): ${c.content}`).join('\n\n')}

   AI RESPONSE:
   ${response}

   Extract each factual claim and evaluate it against the sources.
   ```

   Calculate `overallScore = supportedClaims / totalClaims`. Handle zero claims as 1.0 (vacuously faithful — a purely reflective response with no factual claims is fine).

   Set `flagged = overallScore < FAITHFULNESS_THRESHOLD`.

   Measure and include `evaluationLatencyMs`.

   Gate behind `ENABLE_FAITHFULNESS_CHECK=true` env var. When disabled, return: `{ claims: [], overallScore: 1.0, flagged: false, evaluationLatencyMs: 0 }`.

   Handle errors: if `generateObject` fails, log and return the no-op result.

2. **Create Supabase migration** at `supabase/migrations/YYYYMMDDHHMMSS_create_faithfulness_checks.sql`:

   ```sql
   CREATE TABLE IF NOT EXISTS public.faithfulness_checks (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
     message_id text NOT NULL,
     overall_score numeric(3,2) NOT NULL,
     flagged boolean NOT NULL DEFAULT false,
     claims jsonb NOT NULL DEFAULT '[]',
     evaluation_latency_ms integer NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   );

   CREATE INDEX idx_faithfulness_flagged ON public.faithfulness_checks (flagged) WHERE flagged = true;
   CREATE INDEX idx_faithfulness_chat ON public.faithfulness_checks (chat_id);
   ```

3. **Create `lib/db/faithfulness.ts`**:

   ```typescript
   export async function saveFaithfulnessCheck(params: {
     chatId: string;
     messageId: string;
     result: FaithfulnessResult;
   }): Promise<void>

   export async function getFlaggedResponses(options?: {
     limit?: number;
     since?: Date;
   }): Promise<Array<{
     id: string;
     chatId: string;
     messageId: string;
     overallScore: number;
     claims: FaithfulnessClaimResult[];
     createdAt: string;
   }>>
   ```

4. **Integrate into the chat route** (`app/(chat)/api/chat/route.ts`):

   In the `onFinish` callback of `createUIMessageStream` (or in the `after()` block), after messages have been saved:

   - Only run when `ENABLE_FAITHFULNESS_CHECK=true`
   - Only run for responses that used the `grounded` strategy (from Prompt 2's CRAG routing). Skip `general_knowledge` and `graceful_decline` — there are no chunks to verify against.
   - Extract retrieved chunks from the finished messages: look for parts with `type === 'tool-result'` whose content contains `results` arrays. Each result has `content`, `id` (or `documentId`), and `documentTitle` fields.
   - Extract response text from assistant message parts with `type === 'text'`.
   - Call `checkFaithfulness(responseText, retrievedChunks)`.
   - Call `saveFaithfulnessCheck({ chatId, messageId, result })`.
   - Log: `[faithfulness] chatId=${chatId} score=${result.overallScore} flagged=${result.flagged} latency=${result.evaluationLatencyMs}ms`
   - This must NOT block the response. Use `after()` from `next/server` or run inside the existing `after` block.

5. **Environment variables:**
   - `ENABLE_FAITHFULNESS_CHECK=true` — Feature flag.
   - Add to `.env.example` with comment.

### Verification checklist

- [ ] `pnpm build` passes with no type errors
- [ ] Migration creates the table (`pnpm db:push`)
- [ ] With `ENABLE_FAITHFULNESS_CHECK=false`: nothing happens, no performance impact
- [ ] With `ENABLE_FAITHFULNESS_CHECK=true`: check runs after grounded responses, results saved
- [ ] Check does NOT run for `general_knowledge` or `graceful_decline` responses
- [ ] Check does NOT block the response stream
- [ ] Flagged responses (score < 0.7) logged with warning
- [ ] `getFlaggedResponses` works for review
- [ ] Graceful degradation: if check fails, error logged, response unaffected
- [ ] Biome lint passes (`pnpm lint`)

---

## Prompt 6: Finish Reason Safety Check and SDK Polish

### Files to read first

- `app/(chat)/api/chat/route.ts` (full file — see the `streamText` call, the `onFinish` callback, and the `after()` block)
- `lib/ai/tools/knowledge-search-tools.ts` (full file — see `executeHybridSearch` error handling)
- `lib/ai/tools/search-knowledge-base.ts` (full file — see the `execute` function error handling)

### Prompt

You are adding three defensive quality improvements to a Next.js therapy reflection app using AI SDK v6 (`ai@6.0.37`). These are safety nets that catch edge cases the other upgrades don't cover.

#### Context

The app uses `streamText` within a `createUIMessageStream` block. The LLM has up to 6 steps (`stopWhen: stepCountIs(6)`) to call knowledge base search tools and generate a response. There is a known bug class where the LLM spends all its steps on tool calls and produces no text content — the UI renders a blank assistant message bubble.

The current `onFinish` callback in the chat route saves messages to the database. The `after()` import from `next/server` is already used for deferred work. The project uses Biome (via `ultracite`) for linting.

#### 1. Blank response detection and fallback injection

When the agent exhausts its tool-step budget without generating text, the user sees a blank message. This is the worst possible UX — worse than an error message. Add detection and a fallback.

**The challenge:** The `onFinish` callback fires after the stream has been sent to the client, so modifying messages there won't affect what the user sees. The fallback must be injected into the stream _before_ it closes.

**Approach:** Use the `streamText` result's `steps` or monitor the stream for text content. The AI SDK 6 `streamText` returns a result object that can be awaited for `finishReason` and `steps`. After `result.toUIMessageStream()` is merged into the `dataStream`, check whether any text was emitted.

Investigate the following approach inside the `execute` callback of `createUIMessageStream`:

```typescript
execute: async ({ writer: dataStream }) => {
  const result = streamText({
    // ... existing config
  });

  // Merge the stream — this sends content to the client as it's generated
  dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

  // After the stream completes, check if text was generated
  // The `text` promise resolves to the full generated text
  const fullText = await result.text;

  if (!fullText || fullText.trim().length === 0) {
    console.warn('[chat] Agent produced no text content — injecting fallback');
    // Write a fallback text delta directly to the data stream
    // Check if this is still possible after merge completes
    dataStream.write({
      type: 'text-delta',
      textDelta: "I wasn't able to formulate a complete response for this question. " +
        "This can happen when my search didn't return the content I needed. " +
        "Could you try rephrasing your question, or would you like to explore this from a different angle?",
    });
  }

  // ... existing title handling
},
```

**Important caveats to investigate:**

1. Check whether `await result.text` blocks until the full stream is consumed. If `dataStream.merge()` is non-blocking, then `await result.text` should wait for stream completion, and then we can check + write the fallback. Test this.

2. Check whether `dataStream.write()` still works after `dataStream.merge()` has completed. If the underlying stream is already closed, this will fail silently or throw. Look at the AI SDK source or docs for `UIMessageStreamWriter` to confirm.

3. If neither approach works within the `execute` callback, an alternative is:
   - In `onFinish`, detect the blank response and save a modified message with the fallback text to the database. The user will see blank initially, but on page refresh/reload the fallback message will appear. This is a worse UX but at least prevents permanent blank messages.
   - Log a warning with the chat ID so it can be monitored.

4. A third option: use AI SDK 6's `onStepFinish` callback on `streamText` to track whether any text has been generated across steps. On the final step, if no text has been emitted, write the fallback to `dataStream`:

```typescript
let hasGeneratedText = false;

const result = streamText({
  // ... existing config
  onStepFinish: ({ text, isContinued }) => {
    if (text && text.trim().length > 0) {
      hasGeneratedText = true;
    }
    if (!isContinued && !hasGeneratedText) {
      console.warn('[chat] Final step reached with no text content');
    }
  },
});
```

Implement whichever approach works. Prioritise delivering the fallback text to the user in real-time over database-only fixes.

#### 2. Extended usage and finish reason logging

Log token usage and finish metadata after each response. This data is essential for cost monitoring and debugging.

In the `onFinish` callback of `streamText` (or `createUIMessageStream` — check which one exposes usage data), add:

```typescript
console.log('[chat] Response complete:', {
  chatId: id,
  finishReason: /* extract from onFinish params */,
  totalSteps: /* number of steps the agent took */,
  promptTokens: /* from usage */,
  completionTokens: /* from usage */,
  totalTokens: /* from usage */,
  toolCallCount: /* count tool-call parts in finished messages */,
  hadSensitiveContent: sensitiveContent.detectedCategories.length > 0,
});
```

Check the type signature of `onFinish` for `createUIMessageStream` in AI SDK 6:
- Does it receive `usage`? Or is usage only available on `streamText`'s `onFinish`?
- Does it receive `finishReason`?
- Does it receive a `steps` array?

If usage is only on `streamText`'s callbacks, use `onStepFinish` or await `result.usage` after the stream completes.

The exact fields to log:

| Field | Source | Notes |
|---|---|---|
| `chatId` | Route variable `id` | Already available |
| `finishReason` | `streamText` result or `onFinish` | `stop`, `tool_calls`, `length`, `content_filter` |
| `totalSteps` | Count from steps array or step counter | How many LLM calls were made |
| `promptTokens` | Usage stats | Input tokens |
| `completionTokens` | Usage stats | Output tokens |
| `totalTokens` | Usage stats | Total cost indicator |
| `toolCallCount` | Count tool-call parts in messages | How many search tools were invoked |
| `model` | `selectedChatModel` | Already available |
| `hadSensitiveContent` | `sensitiveContent.detectedCategories.length > 0` | Already available |

#### 3. Comprehensive error handling in search tools

Ensure `executeHybridSearch` in `lib/ai/tools/knowledge-search-tools.ts` has a top-level try/catch wrapping the ENTIRE function body. Currently the function catches the Supabase RPC error specifically, but the embedding step (`embed()`) and the reranking step (if added from Prompt 1) can also throw.

Check the current error handling:

```typescript
async function executeHybridSearch({ ... }: HybridSearchParams) {
  const supabase = await createClient();

  // This can throw:
  const { embedding } = await embed({ ... });

  // This returns { data, error } — handled:
  const { data, error } = await supabase.rpc("hybrid_search", { ... });

  if (error) {
    // ... handled
  }

  // ... rest of function
}
```

Wrap the entire body in a try/catch:

```typescript
async function executeHybridSearch({ ... }: HybridSearchParams) {
  try {
    const supabase = await createClient();
    const { embedding } = await embed({ ... });
    // ... existing implementation ...
  } catch (error) {
    console.error('[hybrid_search] Unexpected error:', error);
    return {
      results: [],
      error: error instanceof Error ? error.message : 'Unexpected search error',
      confidenceTier: 'low' as const,
      confidenceNote: 'Knowledge base search encountered an unexpected error. Please try again.',
      averageSimilarity: 0,
      maxSimilarity: 0,
    };
  }
}
```

Do the same audit for `searchKnowledgeBase` in `lib/ai/tools/search-knowledge-base.ts`. Its `execute` function has inline embedding and RPC calls — wrap the full `execute` body in try/catch with the same structured error return pattern.

The key principle: **no tool execution should ever throw an unhandled error**. All failures must return a structured response that the LLM can interpret and respond to gracefully (e.g., "I encountered an error searching the knowledge base — let me try to help from general knowledge").

### Verification checklist

- [ ] Blank response detection is implemented — test by temporarily setting `stepCountIs(1)` with a complex query that triggers tool calls
- [ ] Fallback message reaches the user's UI (not just saved to database)
- [ ] Token usage and finish reason are logged after each response
- [ ] Log format includes chatId, model, step count, and sensitive content flag
- [ ] `executeHybridSearch` has a top-level try/catch wrapping the entire function body
- [ ] `searchKnowledgeBase`'s `execute` function has equivalent comprehensive error handling
- [ ] Both error handlers return structured responses (not thrown errors)
- [ ] `npx tsc --noEmit` passes
- [ ] `pnpm lint` passes (Biome via `ultracite`)