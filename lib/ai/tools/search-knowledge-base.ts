/**
 * searchKnowledgeBase – Vercel AI SDK tool for clinical RAG retrieval
 *
 * Location: lib/ai/tools/search-knowledge-base.ts
 *
 * WHY TOOL-BASED RETRIEVAL OVER PRE-FETCHING?
 * ─────────────────────────────────────────────
 * The naive approach is to embed the user's latest message, retrieve chunks,
 * and inject them into the system prompt before the LLM ever sees the query.
 * This "pre-fetch" pattern has three fundamental problems:
 *
 * 1. WASTED RETRIEVAL — Not every message needs RAG. A therapist saying
 *    "thanks, that's helpful" triggers an unnecessary embedding + search cycle.
 *    With tool-based retrieval the model decides *if* retrieval is needed at all.
 *
 * 2. SINGLE-SHOT SEARCH — Pre-fetching gets one chance to guess the right query.
 *    Complex questions like "What safeguarding legislation applies to adolescent
 *    clients undergoing CBT?" span multiple knowledge domains. With tools, the
 *    model can call searchKnowledgeBase multiple times with different filters
 *    (once for legislation, once for CBT content) and synthesise results.
 *
 * 3. BLIND QUERY FORMULATION — Pre-fetching embeds the raw user message, which
 *    may be conversational ("what should I do about that?"). The LLM is far
 *    better at reformulating a focused search query from conversational context,
 *    selecting the right category/modality filters, and even retrying with
 *    different terms if initial results are poor.
 *
 * The Vercel AI SDK's `maxSteps` / `stepCountIs` enables multi-step tool loops,
 * so the model can search → evaluate → refine → search again autonomously.
 */

import { openai } from "@ai-sdk/openai";
import { embed, tool } from "ai";
import { z } from "zod";
import { applyConfidenceThreshold } from "@/lib/ai/confidence";
import {
  buildGracefulDeclineMessage,
  GENERAL_KNOWLEDGE_DISCLAIMER,
  routeByConfidence,
} from "@/lib/ai/confidence-router";
import { parallelSearchAndMerge } from "@/lib/ai/parallel-search";
import { reformulateQuery } from "@/lib/ai/query-reformulation";
import { rerankResults } from "@/lib/ai/rerank";
import type { Session } from "@/lib/auth";
import { devLogger } from "@/lib/dev/logger";
import {
  DOCUMENT_CATEGORIES,
  JURISDICTIONS,
  MODALITIES,
} from "@/lib/types/knowledge";
import { createClient } from "@/utils/supabase/server";

// ---------------------------------------------------------------------------
// Types for the hybrid_search RPC response
// ---------------------------------------------------------------------------
interface HybridSearchResult {
  id: string;
  content: string;
  document_id: string;
  section_path: string | null;
  modality: string | null;
  jurisdiction: string | null;
  document_type: string;
  metadata: Record<string, unknown>;
  similarity_score: number | null;
  combined_rrf_score: number;
  // Joined from knowledge_documents inside the RPC function
  document_title: string;
}

// ---------------------------------------------------------------------------
// Factory props — matches existing tool pattern (createDocument, etc.)
// This tool doesn't need dataStream since it has no streaming UI side-effects,
// but we accept session for consistency and future use (e.g. logging, audit).
// ---------------------------------------------------------------------------
type SearchKnowledgeBaseProps = {
  session: Session;
  /**
   * Sensitive categories detected in the therapist's message by
   * `detectSensitiveContent`. Passed to `routeByConfidence` to determine
   * whether to use KB results, fall back to general knowledge, or decline.
   */
  sensitiveCategories?: string[];
};

// ---------------------------------------------------------------------------
// Tool definition (factory pattern)
// ---------------------------------------------------------------------------
export const searchKnowledgeBase = ({
  session: _session,
  sensitiveCategories = [],
}: SearchKnowledgeBaseProps) =>
  tool({
    description:
      "Search the clinical knowledge base of legislation, ethical guidelines, " +
      "therapeutic framework content, and clinical practice guidance. Use this " +
      "when the therapist asks about specific techniques, ethical obligations, " +
      "legal requirements, clinical frameworks, or documentation practices. " +
      "Always search before providing clinical guidance.",

    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "A focused search query. Reformulate the therapist's conversational " +
            "message into precise clinical terminology for better retrieval. " +
            'E.g. "confidentiality obligations child safeguarding" rather than ' +
            '"what do I need to do about keeping things private with kids".'
        ),
      category: z
        .enum(DOCUMENT_CATEGORIES)
        .optional()
        .describe(
          'Filter by content category. Use "legislation" for legal/statutory ' +
            'questions, "guideline" for professional body standards (BACP, UKCP, ' +
            'HCPC), "therapeutic_content" for technique/framework queries, ' +
            '"clinical_practice" for documentation, record-keeping, and treatment ' +
            "planning guidance. Omit to search across all categories."
        ),
      modality: z
        .enum(MODALITIES)
        .optional()
        .describe(
          "Filter by therapeutic modality. IMPORTANT: always set this when the " +
            "therapist is asking about a specific approach to prevent cross-modality " +
            "content bleeding (e.g. CBT techniques appearing in a person-centred " +
            "reflection)."
        ),
      jurisdiction: z
        .enum(JURISDICTIONS)
        .optional()
        .describe(
          'Filter by legal jurisdiction. Set to "UK" for therapists in England, ' +
            'Wales, Scotland, or Northern Ireland; "EU" for Republic of Ireland ' +
            "and other EU member states. Critical for legislation queries to avoid " +
            "surfacing the wrong jurisdiction's legal requirements."
        ),
    }),

    execute: async ({ query, category, modality, jurisdiction }) => {
      try {
        const toolInput = { query, category, modality, jurisdiction };
        const turnStart = performance.now();

        const supabase = await createClient();

        // ── Step 1: Reformulate query into clinical variants ────────────────
        // Cost when enabled: ~$0.0003 (one gpt-4o-mini call).
        // When ENABLE_QUERY_REFORMULATION is not "true", returns [query].
        const reformulationStart = performance.now();
        const queries = await reformulateQuery(
          query,
          category ?? null,
          modality ?? null
        );
        const reformulationMs = performance.now() - reformulationStart;

        if (queries.length > 1) {
          console.log(`[RAG] multi-query: ${queries.length} variants`, queries);
        }

        // ── Step 2: Parallel embed + search for each query variant ──────────
        // Cost when reformulation enabled: 3 additional embedding calls
        // (~$0.00001 each) and 3 additional RPC calls (parallel, so latency ≈
        // slowest single call). Reranking filters the expanded pool back to topN.
        //
        // The embedding must be passed as a string-encoded array because
        // Supabase RPC doesn't natively handle vector types in parameters.
        const matchCount = 5;
        const searchFn = async (q: string): Promise<HybridSearchResult[]> => {
          const { embedding } = await embed({
            model: openai.embedding("text-embedding-3-small"),
            value: q,
            providerOptions: { openai: { dimensions: 512 } },
          });
          const { data, error } = await supabase.rpc("hybrid_search", {
            query_text: q,
            query_embedding: `[${embedding.join(",")}]`,
            match_count: matchCount,
            filter_category: category ?? null,
            filter_modality: modality ?? null,
            filter_jurisdiction: jurisdiction ?? null,
          });
          if (error) {
            throw error;
          }
          return data as HybridSearchResult[];
        };

        const searchStart = performance.now();
        let rawData: HybridSearchResult[];

        try {
          rawData = await parallelSearchAndMerge(queries, searchFn, matchCount);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            "[searchKnowledgeBase] parallel search failed:",
            message
          );

          const errorStrategy =
            sensitiveCategories.length > 0
              ? "graceful_decline"
              : "general_knowledge";

          devLogger.currentTurn()?.logToolCall({
            toolName: "searchKnowledgeBase",
            input: toolInput,
            timing: {
              embeddingMs: Math.round(reformulationMs),
              searchMs: Math.round(performance.now() - searchStart),
              totalMs: Math.round(performance.now() - turnStart),
            },
            rawResults: [],
            confidenceAssessment: {
              tier: "low",
              note: message,
              averageSimilarity: 0,
              maxSimilarity: 0,
              droppedCount: 0,
            },
            filteredResults: [],
          });

          return {
            results: [],
            result_count: 0,
            error:
              "Knowledge base search failed. Please try rephrasing your query.",
            confidenceTier: "low" as const,
            confidenceNote:
              "Knowledge base search failed. Please try rephrasing your query.",
            averageSimilarity: 0,
            maxSimilarity: 0,
            strategy: errorStrategy as "graceful_decline" | "general_knowledge",
            ...(errorStrategy === "graceful_decline"
              ? { message: buildGracefulDeclineMessage(sensitiveCategories) }
              : { disclaimer: GENERAL_KNOWLEDGE_DISCLAIMER }),
            query_used: query,
            filters_applied: {
              category: category ?? "all",
              modality: modality ?? "all",
              jurisdiction: jurisdiction ?? "all",
            },
          };
        }

        const searchMs = performance.now() - searchStart;
        console.log(
          `[RAG] parallel search merged ${rawData.length} results from ${queries.length} queries`
        );

        const mapped = rawData.map((chunk) => ({
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

        // ----------------------------------------------------------------
        // Step 4: Rerank results using Cohere cross-encoder (if enabled).
        // Reranking produces more accurate relevance scores than cosine
        // similarity alone. The `wasReranked` flag selects the appropriate
        // confidence threshold set downstream.
        // ----------------------------------------------------------------
        const { results: toAssess, wasReranked } = await rerankResults(
          query,
          mapped
        );

        // ----------------------------------------------------------------
        // Step 5: Assess confidence and shape the response for the LLM
        // The confidence threshold system filters out low-relevance results
        // and assigns a tier (high/moderate/low) that the LLM uses to
        // decide whether to cite results directly, add hedging, or refer
        // the therapist to their supervisor.
        // ----------------------------------------------------------------
        const assessed = applyConfidenceThreshold(toAssess, wasReranked);
        const route = routeByConfidence(assessed, sensitiveCategories);

        // ── Dev logging ────────────────────────────────────────────────
        devLogger.currentTurn()?.logToolCall({
          toolName: "searchKnowledgeBase",
          input: toolInput,
          timing: {
            embeddingMs: Math.round(reformulationMs),
            searchMs: Math.round(searchMs),
            totalMs: Math.round(performance.now() - turnStart),
          },
          rawResults: toAssess.map((r) => ({
            documentTitle: r.document_title,
            similarityScore: r.similarity_score,
            rrfScore: r.rrf_score,
            contentPreview: r.content.slice(0, 200),
            modality: r.modality,
            jurisdiction: r.jurisdiction,
          })),
          confidenceAssessment: {
            tier: assessed.confidenceTier,
            note: assessed.confidenceNote,
            averageSimilarity: assessed.averageSimilarity,
            maxSimilarity: assessed.maxSimilarity,
            droppedCount: assessed.droppedCount,
          },
          filteredResults: assessed.results.map((r) => ({
            documentTitle: r.document_title,
            similarityScore: r.similarity_score,
            contentPreview: r.content.slice(0, 200),
            modality: r.modality,
            jurisdiction: r.jurisdiction,
          })),
        });

        const routedResults =
          route.strategy === "grounded" ? route.results : [];
        return {
          results: routedResults,
          result_count: routedResults.length,
          confidenceTier: assessed.confidenceTier,
          confidenceNote:
            route.strategy === "grounded" ? route.confidenceNote : null,
          averageSimilarity: assessed.averageSimilarity,
          maxSimilarity: assessed.maxSimilarity,
          strategy: route.strategy,
          ...(route.strategy === "general_knowledge"
            ? { disclaimer: route.disclaimer }
            : {}),
          ...(route.strategy === "graceful_decline"
            ? { message: route.message }
            : {}),
          query_used: query,
          filters_applied: {
            category: category ?? "all",
            modality: modality ?? "all",
            jurisdiction: jurisdiction ?? "all",
          },
        };
      } catch (error) {
        console.error("[searchKnowledgeBase] Unexpected error:", error);
        const errorStrategy =
          sensitiveCategories.length > 0
            ? "graceful_decline"
            : "general_knowledge";
        return {
          results: [],
          result_count: 0,
          error:
            error instanceof Error ? error.message : "Unexpected search error",
          confidenceTier: "low" as const,
          confidenceNote:
            "Knowledge base search encountered an unexpected error. Please try again.",
          averageSimilarity: 0,
          maxSimilarity: 0,
          strategy: errorStrategy as "graceful_decline" | "general_knowledge",
          ...(errorStrategy === "graceful_decline"
            ? { message: buildGracefulDeclineMessage(sensitiveCategories) }
            : { disclaimer: GENERAL_KNOWLEDGE_DISCLAIMER }),
          query_used: query,
          filters_applied: {
            category: category ?? "all",
            modality: modality ?? "all",
            jurisdiction: jurisdiction ?? "all",
          },
        };
      }
    },
  });
