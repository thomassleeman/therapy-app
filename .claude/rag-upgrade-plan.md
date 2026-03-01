# RAG System Upgrade Plan

**Date:** 2026-02-27
**Status:** Planning
**Scope:** Retrieval quality, agent architecture, confidence routing, SDK modernisation

---

## Current state

The Phase 4 RAG pipeline is functionally complete: hybrid search (vector + FTS with RRF), domain-specific search tools (legislation, guidelines, therapeutic content, clinical practice), confidence thresholds, no-results handling, and sensitive content detection are all implemented. The system runs on AI SDK 6.0.37 with `streamText` + `stepCountIs(6)` for multi-step tool calling.

Known weaknesses:

- **Semantic gap** between how therapists describe situations and how clinical content is indexed — the single biggest retrieval quality issue
- **No reranking stage** — hybrid search returns results ranked by RRF score, but there's no cross-encoder pass to evaluate true query-document relevance
- **Flat confidence routing** — the current system returns confidence tiers (high/moderate/low) that affect *response framing* but don't change *system behaviour* (e.g., falling back to general knowledge for moderate confidence)
- **Blank response bug** on sensitive content paths — conflicting MUST-search directives + empty KB + strict grounding rules = tool-step exhaustion with no text output
- **No post-generation verification** — the system trusts whatever the LLM produces once it has context; there's no faithfulness check
- **Ad-hoc agent wiring** — tools, system prompt assembly, sensitive content injection, and step limits are all configured inline in the chat route rather than as a composable agent

This plan addresses these weaknesses through five upgrade streams, ordered by impact and dependency.

---

## Upgrade 1: Cohere reranking after hybrid search

**Why this matters most:** The Proven Approaches research found that adding reranking to contextual retrieval + hybrid search achieved 67% fewer retrieval failures — the largest measured improvement in the study. We already have the first two components; reranking is the missing third leg. Cross-encoder rerankers jointly evaluate query-document pairs rather than comparing pre-computed embeddings, which directly addresses the semantic gap: "client went quiet" evaluated alongside a chunk about "therapeutic rupture and withdrawal" scores much more accurately than cosine similarity alone.

**What AI SDK 6 provides:** A built-in `rerank` function that works with `cohere.reranking('rerank-v3.5')` and `bedrock.reranking('cohere.rerank-v3-5:0')`. It accepts structured documents (not just strings), supports `topN` limiting, and integrates natively with the SDK's provider system.

### Implementation

**New dependency:** `@ai-sdk/cohere`

**Where it fits:** Inside `executeHybridSearch` in `lib/ai/tools/knowledge-search-tools.ts`, after the Supabase RPC returns results but before `applyConfidenceThreshold` runs. This means reranking improves the quality of what the confidence system evaluates — reranked results will have more accurate similarity-to-relevance alignment.

```
Current flow:
  query → embed → hybrid_search RPC → applyConfidenceThreshold → return to LLM

New flow:
  query → embed → hybrid_search RPC → rerank (Cohere) → applyConfidenceThreshold → return to LLM
```

**Sketch:**

```typescript
import { cohere } from '@ai-sdk/cohere';
import { rerank } from 'ai';

// Inside executeHybridSearch, after the Supabase RPC returns:
const reranked = await rerank({
  model: cohere.reranking('rerank-v3.5'),
  query,
  documents: rpcResults.map(r => ({
    id: r.id,
    text: r.content,
    // Preserve all metadata for downstream use
    document_title: r.document_title,
    section_path: r.section_path,
    document_type: r.document_type,
    modality: r.modality,
    jurisdiction: r.jurisdiction,
  })),
  topN: matchCount, // Typically 5
});

// Map reranked results back, using Cohere's relevance score
// as a higher-quality replacement for RRF score
const finalResults = reranked.results.map(r => ({
  ...rpcResults.find(orig => orig.id === r.document.id),
  similarity_score: r.relevanceScore, // Cohere's cross-encoder score
}));
```

**GDPR note:** The text sent to Cohere is knowledge base content (authored clinical guidelines, legislation summaries) — not therapist messages or client data. The therapist's query string is also sent as the reranking query. This is the same class of data already sent to OpenAI for embedding. Review Cohere's data processing terms, but the exposure profile is equivalent to the existing embedding call.

**Confidence threshold recalibration:** Cohere relevance scores (0–1) have a different distribution to cosine similarity scores. The current thresholds (0.80 high, 0.65 minimum) will need adjustment. Start with 0.70 high / 0.50 minimum for reranker scores and tune from there using the golden test dataset.

### Tasks

1. Install `@ai-sdk/cohere`, add `COHERE_API_KEY` to env
2. Add reranking step to `executeHybridSearch` with a feature flag (`ENABLE_RERANKING=true`)
3. Map Cohere relevance scores back into the result structure
4. Recalibrate confidence thresholds for reranker score distribution
5. Update golden test dataset to measure retrieval quality before/after
6. Add latency logging — reranking adds one API call (~100–300ms)

---

## Upgrade 2: Tiered CRAG confidence routing

**Why:** The current confidence system changes how the LLM *frames* its response (hedging language, supervisor referral) but doesn't change *what the system does*. CRAG's core insight is that different confidence levels should trigger different system behaviours. This directly fixes the blank response bug — instead of the LLM being stuck between "MUST cite knowledge base" and "knowledge base has nothing", the system routes to an appropriate fallback.

**The three tiers for this platform:**

| Tier | Condition | Behaviour |
|------|-----------|-----------|
| **Grounded** | Reranker score ≥ high threshold AND ≥ 1 chunk passes | Use KB results directly. Cite sources. Present with full authority. |
| **General knowledge** | Reranker score in moderate range OR no chunks pass but topic is non-sensitive | Discard KB results. Allow the LLM to respond from general training knowledge. Clearly label: *"I don't have specific guidance on this in the knowledge base, but from general clinical practice..."* No source citations. |
| **Graceful decline** | Low confidence AND topic is sensitive (detected by sensitive content module) | Don't attempt to answer. Return a supportive, safety-conscious response directing to supervisor/safeguarding lead. Never hallucinate clinical guidance on sensitive topics. |

**Why this framing works for a therapist audience:** This is a reflection tool for qualified professionals, not a medical device. Therapists are trained to evaluate information critically and consult supervisors. The "general knowledge" tier acknowledges that the LLM's training data includes substantial clinical knowledge that can be useful — it just needs to be clearly labelled as unverified by the knowledge base. The "graceful decline" tier exists only for the narrow category of sensitive topics (safeguarding, suicidal ideation, therapist distress) where getting it wrong has disproportionate consequences.

### Implementation

**Where it fits:** This replaces the current `applyConfidenceThreshold` → `buildContextualResponse` flow. The confidence assessment still happens, but instead of always returning results with a note, the tier determines the response strategy.

**New module:** `lib/ai/confidence-router.ts`

```typescript
export type ConfidenceRoute =
  | { strategy: 'grounded'; results: RankedResult[]; }
  | { strategy: 'general_knowledge'; topic: string; disclaimer: string; }
  | { strategy: 'graceful_decline'; message: string; };

export function routeByConfidence(
  confidenceTier: 'high' | 'moderate' | 'low',
  isSensitiveTopic: boolean,
  results: RankedResult[],
): ConfidenceRoute {
  if (confidenceTier === 'high') {
    return { strategy: 'grounded', results };
  }
  if (confidenceTier === 'low' && isSensitiveTopic) {
    return { strategy: 'graceful_decline', message: '...' };
  }
  // Moderate confidence, OR low confidence on non-sensitive topic
  return { strategy: 'general_knowledge', topic: '...', disclaimer: '...' };
}
```

**Integration with sensitive content detection:** The router needs to know whether the current query hit a sensitive content category. This is already detected in the chat route before `streamText`. Pass the `detectedCategories` array into the tool context so the search tools can use it in routing decisions.

**System prompt changes:** The LLM needs different instructions per tier. Rather than a single static system prompt, the prompt assembly reads the confidence route and appends tier-specific instructions:

- **Grounded:** "The following knowledge base results are high-confidence matches. Use them as your primary source. Cite document titles."
- **General knowledge:** "No sufficiently relevant knowledge base content was found for this query. You may respond from your general clinical training knowledge, but you MUST preface your response with a clear statement that this is general guidance, not sourced from the knowledge base. Do not fabricate citations."
- **Graceful decline:** "This query involves sensitive clinical territory and no relevant knowledge base content was found. Do not attempt to provide clinical guidance. Instead, acknowledge the question, validate its importance, and direct the therapist to their clinical supervisor, safeguarding lead, or relevant professional body."

**Blank response bug fix:** This directly resolves the bug. When sensitive content is detected AND the KB is empty, the system routes to "graceful decline" instead of issuing contradictory MUST-search + MUST-ground directives. The LLM receives a clear, achievable instruction: respond supportively without clinical content.

### Tasks

1. Create `lib/ai/confidence-router.ts` with the three-tier routing logic
2. Refactor `executeHybridSearch` to return the route strategy alongside results
3. Pass sensitive content detection state into tool context
4. Update system prompt assembly to inject tier-specific instructions
5. Refactor sensitive content directives to work with the routing system (remove MUST-search directives that cause blank responses; instead let the router handle the fallback)
6. Add "should decline gracefully" test cases to the golden dataset
7. Add "should use general knowledge" test cases for moderate-confidence non-sensitive queries

---

## Upgrade 3: Migrate to ToolLoopAgent

**Why:** The current architecture configures everything inline in the chat route — model, system prompt, tools, step limits, sensitive content injection. AI SDK 6's `ToolLoopAgent` provides a composable abstraction that separates agent definition from invocation, gives type-safe tool results all the way to the UI, and provides `prepareCall` hooks for per-request customisation (therapist profile, modality, jurisdiction, sensitive content state).

**What this changes architecturally:** The agent becomes a first-class module rather than configuration scattered across the route handler. Tools are defined in their own files (already done), composed into the agent, and the route simply calls `agent.stream()`.

### Implementation

**New file:** `lib/ai/agents/therapy-reflection-agent.ts`

```typescript
import { ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { knowledgeSearchTools } from '@/lib/ai/tools/knowledge-search-tools';
import { systemPrompt } from '@/lib/ai/prompts';

export const therapyReflectionAgent = new ToolLoopAgent({
  model: 'gateway/xai-grok-3-mini',

  callOptionsSchema: z.object({
    therapeuticOrientation: z.string().optional(),
    effectiveModality: z.string().nullable(),
    effectiveJurisdiction: z.string().nullable(),
    sensitiveContentPrompt: z.string(),
    session: z.custom<Session>(),
  }),

  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    instructions: systemPrompt({
      selectedChatModel: settings.model,
      therapeuticOrientation: options.therapeuticOrientation,
      effectiveModality: options.effectiveModality,
      effectiveJurisdiction: options.effectiveJurisdiction,
    }) + options.sensitiveContentPrompt,
    tools: {
      ...knowledgeSearchTools({ session: options.session }),
      // ... other tools (document creation, etc.)
    },
  }),

  stopWhen: stepCountIs(6),
});
```

**Route simplification:** The chat route becomes:

```typescript
import { createAgentUIStreamResponse } from 'ai';
import { therapyReflectionAgent } from '@/lib/ai/agents/therapy-reflection-agent';

// After auth, sensitive content detection, and profile resolution:
return createAgentUIStreamResponse({
  agent: therapyReflectionAgent,
  uiMessages,
  options: {
    therapeuticOrientation,
    effectiveModality,
    effectiveJurisdiction,
    sensitiveContentPrompt,
    session,
  },
});
```

**Type-safe UI messages:** The `InferAgentUIMessage` type from the agent definition flows through to the client's `useChat` hook, giving typed tool invocation parts. This enables rendering tool-specific UI components (e.g., a "Sources" panel showing retrieved documents) without manual type assertions.

### Tasks

1. Create `lib/ai/agents/therapy-reflection-agent.ts`
2. Define the `callOptionsSchema` covering all per-request context
3. Move system prompt assembly into `prepareCall`
4. Move tool registration into `prepareCall`
5. Simplify the chat route to use `createAgentUIStreamResponse`
6. Export `InferAgentUIMessage` type for the client
7. Update client `useChat` to use the typed message format
8. Verify sensitive content injection still works via `options.sensitiveContentPrompt`
9. Verify `stopWhen: stepCountIs(6)` preserves existing multi-step behaviour

---

## Upgrade 4: Multi-query retrieval for vocabulary coverage

**Why:** The Proven Approaches research identifies vocabulary mismatch as causing ~20% of retrieval failures. The existing system fires a single search query per tool call. When a therapist says "my client keeps going quiet mid-session", the embedding for that phrasing may not land near chunks about "therapeutic rupture", "client withdrawal", or "metacommunication". Multi-query retrieval generates 2–3 reformulations and merges results, dramatically improving recall on conversational queries.

**How it works without over-engineering:** Rather than adding a full `MultiQueryRetriever` framework, use the LLM itself to generate reformulations as part of the tool call. The Vercel AI SDK's `generateObject` can produce reformulations in a structured schema, which are then searched in parallel.

### Implementation

**New utility:** `lib/ai/query-reformulation.ts`

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

export async function reformulateQuery(
  originalQuery: string,
  category: string,
): Promise<string[]> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object({
      reformulations: z.array(z.string()).length(3),
    }),
    prompt: `You are a clinical terminology expert. Given a therapist's search query, generate exactly 3 reformulations that might match clinical knowledge base content. Include the original clinical terminology that guidelines and textbooks would use.

Category: ${category}
Original query: "${originalQuery}"

Return 3 reformulations. Each should use different clinical vocabulary while preserving the original intent. Include formal diagnostic/therapeutic terminology where appropriate.`,
    temperature: 0.3,
  });

  return [originalQuery, ...object.reformulations];
}
```

**Where it fits:** Inside the search tools, before embedding. The tool receives the therapist's conversational query, generates reformulations, embeds all of them, runs hybrid search for each, and merges results using RRF before reranking.

**Cost control:** This adds one `gpt-4o-mini` call per search (~$0.0003) and 2–3 additional embedding calls (~$0.00001 each). The reranking step downstream filters the expanded candidate pool back to the top N, so the LLM context doesn't grow. Gate behind a feature flag and only enable for queries below a confidence threshold on initial retrieval — high-confidence single-query results don't need reformulation.

### Tasks

1. Create `lib/ai/query-reformulation.ts`
2. Add reformulation step to `executeHybridSearch` (behind feature flag)
3. Implement parallel search across reformulations
4. Merge results with RRF before reranking
5. Measure retrieval improvement on golden dataset: before/after reformulation
6. Tune: only trigger reformulation when initial single-query retrieval scores below moderate threshold (adaptive retrieval)

---

## Upgrade 5: Post-generation faithfulness verification

**Why:** Even with good retrieval, the LLM can drift from sources — paraphrasing clinical terminology, synthesising across chunks in misleading ways, or subtly hallucinating details. The Proven Approaches research recommends post-generation faithfulness checking as a production-grade safety layer. For a clinical application, this is the difference between "probably grounded" and "verified grounded".

**Approach:** A lightweight LLM-as-judge call after generation, using `generateObject` with a structured schema. This runs asynchronously and doesn't block the response stream — it logs results for monitoring and can trigger a visible warning in the UI if faithfulness drops below threshold.

### Implementation

**New module:** `lib/ai/faithfulness-check.ts`

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const FaithfulnessResult = z.object({
  claims: z.array(z.object({
    claim: z.string(),
    supported: z.boolean(),
    sourceChunkId: z.string().nullable(),
  })),
  overallScore: z.number().min(0).max(1),
  flagged: z.boolean(),
});

export async function checkFaithfulness(
  response: string,
  retrievedChunks: { id: string; content: string }[],
): Promise<z.infer<typeof FaithfulnessResult>> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: FaithfulnessResult,
    temperature: 0,
    prompt: `You are a clinical accuracy auditor. Given an AI response and the source chunks it was based on, evaluate whether each factual claim in the response is supported by the source material.

SOURCE CHUNKS:
${retrievedChunks.map(c => `[${c.id}]: ${c.content}`).join('\n\n')}

AI RESPONSE:
${response}

For each factual claim in the response, determine if it is directly supported by one of the source chunks. Set flagged=true if overallScore < 0.7.`,
  });

  return object;
}
```

**Integration:** This runs after `streamText` completes, as an async background task. It doesn't block the user's response. Results are logged to a `faithfulness_checks` table for monitoring. If the score falls below 0.7, a UI indicator could flag the response — but for MVP, just log it.

**When to skip:** Only run on "grounded" tier responses (where KB content was actually used). General knowledge responses and graceful declines don't need faithfulness checking against KB content.

### Tasks

1. Create `lib/ai/faithfulness-check.ts`
2. Create `faithfulness_checks` table in Supabase for monitoring
3. Wire into the chat route as a post-response async task (using `waitUntil` from `@vercel/functions`)
4. Add dashboard/query for reviewing low-faithfulness responses
5. Set alerting threshold (< 0.7 = review needed)
6. Only run for "grounded" tier responses

---

## Additional SDK features to integrate

### AI SDK DevTools

AI SDK 6 ships with DevTools for inspecting agent behaviour — tool calls, step-by-step execution, timing. This is useful during development and evaluation but has no production cost.

**Task:** Enable DevTools in development mode. Use during golden dataset testing to inspect retrieval quality per step.

### Raw finish reason and extended usage

AI SDK 6 exposes the raw finish reason (`stop`, `tool_calls`, `length`, `content_filter`) and extended usage stats from the provider. This helps diagnose the blank response bug class — if `finishReason` is `tool_calls` with no text content, the system can detect tool-step exhaustion and trigger a fallback.

**Task:** Log `finishReason` and `usage` from `streamText` result. Add a safety check: if the final step's finish reason is `tool_calls` (not `stop`), append a fallback text response rather than returning blank.

### Middleware for cross-cutting concerns

AI SDK 6 supports composable middleware via `wrapLanguageModel`. This could centralise concerns that are currently handled ad-hoc:

- **Logging middleware:** Capture all tool calls, results, and generation stats in a structured format
- **Rate limiting middleware:** Prevent excessive tool calls per request
- **Guardrail middleware:** Run sensitive content detection as middleware rather than in the route

**Task:** Evaluate middleware for logging as a first use case. Defer guardrail middleware until after the ToolLoopAgent migration stabilises.

---

## Implementation order and dependencies

```
Phase A — Retrieval quality (can start immediately)
  ├── Upgrade 1: Cohere reranking
  │     └── Recalibrate confidence thresholds
  └── Upgrade 4: Multi-query retrieval
        └── Depends on: reranking (to filter expanded candidate pool)

Phase B — Confidence routing (after reranking is calibrated)
  └── Upgrade 2: Tiered CRAG routing
        ├── Fixes: blank response bug
        └── Depends on: recalibrated thresholds from Upgrade 1

Phase C — Agent architecture (independent, can parallel Phase A)
  └── Upgrade 3: ToolLoopAgent migration
        ├── Simplifies: route handler
        ├── Enables: typed UI messages
        └── Absorbs: sensitive content injection via prepareCall

Phase D — Verification (after Phases A + B)
  └── Upgrade 5: Post-generation faithfulness
        └── Depends on: tiered routing (only runs on grounded tier)

Phase E — Polish (after C)
  ├── DevTools integration
  ├── Finish reason safety check
  └── Middleware evaluation
```

**Critical path:** Upgrade 1 (reranking) → threshold recalibration → Upgrade 2 (CRAG routing) → Upgrade 5 (faithfulness). This sequence progressively improves retrieval quality, then adds behavioural routing, then verifies output quality.

**Parallel track:** Upgrade 3 (ToolLoopAgent) can proceed independently since it's an architectural refactor that doesn't change retrieval logic. Merge it before or after the retrieval upgrades — either order works.

---

## What this plan does NOT include

- **GraphRAG / knowledge graphs** — deferred until the core pipeline is mature and there's evidence that relational queries across therapeutic concepts are a significant failure mode
- **Fine-tuning** — the Proven Approaches research is clear: fine-tune for style, not knowledge. Not needed until the reflective tone needs calibration, which requires real usage data
- **Semantic caching** — premature optimisation at current scale
- **Cross-encoder self-hosting** — using Cohere's hosted reranker is simpler and sufficient; self-hosting a cross-encoder only makes sense at scale where API costs dominate
- **Full RAGAS evaluation pipeline in CI/CD** — this requires content in the KB first (Aaron's Phase 2 work). Once content exists, build the eval pipeline as a separate workstream

---

## Dependencies and blockers

| Dependency | Status | Impact |
|---|---|---|
| Cohere API key + data processing agreement | Needed for Upgrade 1 | Must review GDPR terms before production use |
| Knowledge base content (Aaron's Phase 2) | Still empty | Upgrades 1–5 can be implemented and tested with synthetic content, but real evaluation needs real content |
| Confidence threshold recalibration | Blocked by Upgrade 1 | Current thresholds (0.80/0.65) are calibrated for cosine similarity, not reranker scores |
| Golden test dataset | Exists in plan, not yet created | Essential for measuring impact of each upgrade — create before starting implementation |
