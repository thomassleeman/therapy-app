/**
 * Domain-specific knowledge base search tools for the therapy reflection RAG system.
 *
 * These specialised tools wrap the shared `hybrid_search` Supabase RPC function,
 * each pre-setting the content category, tuning search weights, and enforcing
 * the appropriate filters for its domain. The LLM can call multiple tools in a
 * single turn for cross-domain questions (e.g. "What CBT techniques help with
 * anxiety, and what confidentiality obligations apply?").
 *
 * All four tools plus the general `searchKnowledgeBase` are registered in the
 * `streamText` call so the model can route queries intelligently.
 *
 * ROUTING
 * ───────
 * Each tool response now includes a `strategy` field from `routeByConfidence`.
 * The LLM uses this field (via system prompt instructions) to determine whether
 * to cite KB results (`grounded`), respond from general knowledge
 * (`general_knowledge`), or gracefully decline a sensitive topic
 * (`graceful_decline`). See lib/ai/confidence-router.ts for full routing logic.
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
import { createClient } from "@/utils/supabase/server";

// ─── Shared types ───────────────────────────────────────────────────────────

/** The row shape returned by the `hybrid_search` RPC function. */
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

/** Parameters forwarded to the `hybrid_search` RPC. */
interface HybridSearchParams {
  query: string;
  /** Tool name used for dev logging — matches the key in streamText's tools map. */
  toolName: string;
  /** Input params the LLM passed (for log fidelity). */
  toolInput: Record<string, unknown>;
  category?: string | null;
  modality?: string | null;
  jurisdiction?: string | null;
  matchCount?: number;
  fullTextWeight?: number;
  semanticWeight?: number;
  /**
   * Sensitive categories detected in the therapist's message.
   * Passed through to `routeByConfidence` to determine the response strategy.
   */
  sensitiveCategories?: string[];
  // Accepted for consistency with the factory pattern and future use
  // (e.g. audit logging, rate limiting). Not used by the RPC itself.
  session?: Session;
}

// ─── Shared search executor ─────────────────────────────────────────────────

/**
 * Generates an embedding for `query` and calls the Supabase `hybrid_search`
 * RPC with the supplied filters and weight overrides.
 *
 * Every domain-specific tool delegates to this function so the embedding model,
 * RPC contract, confidence routing, and error handling live in one place.
 */
async function executeHybridSearch({
  query,
  toolName,
  toolInput,
  category = null,
  modality = null,
  jurisdiction = null,
  matchCount = 5,
  fullTextWeight = 1.0,
  semanticWeight = 1.0,
  sensitiveCategories = [],
}: HybridSearchParams) {
  try {
    const supabase = await createClient();
    const turnStart = performance.now();

    // ── Step 1: Reformulate query into clinical variants ──────────────────────
    // Cost when enabled: ~$0.0003 (one gpt-4o-mini call).
    // When ENABLE_QUERY_REFORMULATION is not "true", returns [query] immediately.
    const reformulationStart = performance.now();
    const queries = await reformulateQuery(query, category, modality);
    const reformulationMs = performance.now() - reformulationStart;

    if (queries.length > 1) {
      console.log(`[RAG] multi-query: ${queries.length} variants`, queries);
    }

    // ── Step 2: Parallel embed + search for each query variant ────────────────
    // Cost when reformulation enabled: 3 additional embedding calls (~$0.00001
    // each) and 3 additional RPC calls (parallel, so latency ≈ slowest call).
    // Reranking downstream filters the expanded pool back to topN.
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
        filter_category: category,
        filter_modality: modality,
        filter_jurisdiction: jurisdiction,
        full_text_weight: fullTextWeight,
        semantic_weight: semanticWeight,
        rrf_k: 60,
      });
      if (error) {
        throw error;
      }
      return data as HybridSearchResult[];
    };

    const searchStart = performance.now();
    let rawResults: HybridSearchResult[];

    try {
      rawResults = await parallelSearchAndMerge(queries, searchFn, matchCount);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[hybrid_search] parallel search failed: ${message}`, {
        category,
        modality,
        jurisdiction,
      });

      const errorStrategy =
        sensitiveCategories.length > 0
          ? "graceful_decline"
          : "general_knowledge";

      devLogger.currentTurn()?.logToolCall({
        toolName,
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
        error: message,
        confidenceTier: "low" as const,
        confidenceNote:
          "Knowledge base search failed. Please try rephrasing your query.",
        averageSimilarity: 0,
        maxSimilarity: 0,
        strategy: errorStrategy as "graceful_decline" | "general_knowledge",
        ...(errorStrategy === "graceful_decline"
          ? { message: buildGracefulDeclineMessage(sensitiveCategories) }
          : { disclaimer: GENERAL_KNOWLEDGE_DISCLAIMER }),
      };
    }

    const searchMs = performance.now() - searchStart;
    console.log(
      `[RAG] parallel search merged ${rawResults.length} results from ${queries.length} queries`
    );

    const mapped = rawResults.map((chunk) => ({
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

    const { results: toAssess, wasReranked } = await rerankResults(
      query,
      mapped,
      matchCount
    );
    const assessed = applyConfidenceThreshold(toAssess, wasReranked);
    const route = routeByConfidence(assessed, sensitiveCategories);
    const totalMs = Math.round(performance.now() - turnStart);

    console.log("[RAG] search results:", {
      resultCount: assessed.results.length,
      confidenceTier: assessed.confidenceTier,
      strategy: route.strategy,
      maxSimilarity: assessed.maxSimilarity,
      reranked: wasReranked,
      titles: toAssess.map((r) => r.documentTitle),
      ...(wasReranked && process.env.NODE_ENV === "development"
        ? {
            cohereScores: toAssess.map((r) => ({
              title: r.documentTitle,
              score: r.similarityScore,
            })),
            originalScores: mapped.map((r) => ({
              title: r.documentTitle,
              score: r.similarityScore,
            })),
          }
        : {}),
    });

    // ── Dev logging ──────────────────────────────────────────────────────────
    devLogger.currentTurn()?.logToolCall({
      toolName,
      input: toolInput,
      timing: {
        embeddingMs: Math.round(reformulationMs),
        searchMs: Math.round(searchMs),
        totalMs,
      },
      rawResults: toAssess.map((r) => ({
        documentTitle: r.documentTitle,
        similarityScore: r.similarityScore,
        rrfScore: r.rrfScore,
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
        documentTitle: r.documentTitle,
        similarityScore: r.similarityScore,
        contentPreview: r.content.slice(0, 200),
        modality: r.modality,
        jurisdiction: r.jurisdiction,
      })),
    });

    return {
      results: route.strategy === "grounded" ? route.results : [],
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
    };
  } catch (error) {
    console.error("[hybrid_search] Unexpected error:", error);
    const errorStrategy =
      sensitiveCategories.length > 0 ? "graceful_decline" : "general_knowledge";
    return {
      results: [],
      error: error instanceof Error ? error.message : "Unexpected search error",
      confidenceTier: "low" as const,
      confidenceNote:
        "Knowledge base search encountered an unexpected error. Please try again.",
      averageSimilarity: 0,
      maxSimilarity: 0,
      strategy: errorStrategy as "graceful_decline" | "general_knowledge",
      ...(errorStrategy === "graceful_decline"
        ? { message: buildGracefulDeclineMessage(sensitiveCategories) }
        : { disclaimer: GENERAL_KNOWLEDGE_DISCLAIMER }),
    };
  }
}

// ─── Tool definitions ───────────────────────────────────────────────────────

/**
 * Tool map for streamText registration.
 */
type KnowledgeSearchToolsProps = {
  session: Session;
  /**
   * Sensitive categories detected in the therapist's message by
   * `detectSensitiveContent`. Threaded into each tool's execute function so
   * `routeByConfidence` can determine the appropriate response strategy.
   */
  sensitiveCategories?: string[];
};

/**
 * Factory returning all domain-specific search tools, ready to spread into the
 * `tools` parameter of `streamText`. Tools are created as closures so that
 * `sensitiveCategories` can be threaded into the confidence routing logic.
 *
 * ```ts
 * import { streamText, stepCountIs } from 'ai';
 * import { knowledgeSearchTools } from '@/lib/ai/tools/knowledge-search-tools';
 *
 * const result = streamText({
 *   model: openai('gpt-4o'),
 *   system: systemPrompt,
 *   messages,
 *   tools: {
 *     ...knowledgeSearchTools({ session, sensitiveCategories }),
 *     // ... other tools
 *   },
 *   stopWhen: stepCountIs(6),
 * });
 * ```
 */
export const knowledgeSearchTools = ({
  session: _session,
  sensitiveCategories = [],
}: KnowledgeSearchToolsProps) =>
  ({
    /**
     * Searches practitioner-oriented legislation briefings.
     *
     * Pre-sets category to 'legislation' and bumps `full_text_weight` to 1.5 so
     * exact statutory references ("Section 117", "Data Protection Act") rank higher
     * in the RRF fusion. Requires `jurisdiction` so results are scoped to the
     * therapist's legal context — the LLM should read this from the therapist's
     * profile or ask if unclear.
     */
    searchLegislation: tool({
      description:
        "Search practitioner-oriented legislation briefings covering therapist legal obligations " +
        "under the Data Protection Act, GDPR, Mental Health Act, Children Act, Care Act and related " +
        "statutes. Use when the therapist asks about legal obligations, statutory duties, or " +
        "legislative requirements. Results are written for therapists, not lawyers, and cite specific " +
        "statutory provisions.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The search query — include specific statutory references where known."
          ),
        jurisdiction: z
          .enum(["UK", "EU"])
          .describe(
            "The therapist's jurisdiction. Infer from the therapist's profile or ask if unclear. " +
              "UK covers England, Wales, Scotland, and Northern Ireland. EU covers Republic of Ireland and other EU member states."
          ),
      }),
      execute: async ({ query, jurisdiction }) =>
        executeHybridSearch({
          query,
          toolName: "searchLegislation",
          toolInput: { query, jurisdiction },
          category: "legislation",
          jurisdiction,
          // Slightly stronger full-text weighting so exact statutory terms
          // (e.g. "Section 117", "Schedule 1") are not diluted by semantic neighbours.
          fullTextWeight: 1.5,
          semanticWeight: 1.0,
          sensitiveCategories,
        }),
    }),

    /**
     * Searches professional body clinical guidelines.
     *
     * Pre-sets category to 'guideline'. Accepts an optional `jurisdiction` to scope
     * results to the therapist's regulatory body — BACP/UKCP/HCPC for UK, relevant
     * EU bodies for EU-based therapists. When omitted, guidelines from all
     * jurisdictions are returned (useful for comparative questions).
     */
    searchGuidelines: tool({
      description:
        "Search professional body guidelines including BACP Ethical Framework, UKCP Code of Conduct, " +
        "HCPC standards, and EU regulatory frameworks. Use when the therapist asks about ethical " +
        "practice, professional standards, confidentiality, informed consent, or professional conduct.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The search query — use professional terminology where possible " +
              '(e.g. "informed consent", "dual relationships", "fitness to practise").'
          ),
        jurisdiction: z
          .enum(["UK", "EU"])
          .optional()
          .describe(
            "Optional. The therapist's jurisdiction to scope results to the relevant regulatory body. " +
              "BACP/UKCP/HCPC for UK, IACP/CORU for EU. Omit to search across all jurisdictions."
          ),
      }),
      execute: async ({ query, jurisdiction }) =>
        executeHybridSearch({
          query,
          toolName: "searchGuidelines",
          toolInput: { query, jurisdiction },
          category: "guideline",
          jurisdiction: jurisdiction ?? null,
          // Balanced weights — guideline language is a mix of precise terms
          // ("fitness to practise") and broader ethical concepts.
          fullTextWeight: 1.0,
          semanticWeight: 1.0,
          sensitiveCategories,
        }),
    }),

    /**
     * Searches therapeutic technique and framework content.
     *
     * Pre-sets category to 'therapeutic_content'. Requires `modality` to prevent
     * cross-modality content bleeding — a CBT query should not surface
     * psychodynamic techniques unless the therapist explicitly wants a comparison
     * (in which case they can call the tool twice with different modalities).
     */
    searchTherapeuticContent: tool({
      description:
        "Search therapeutic technique and framework content. Use when the therapist asks about " +
        "specific techniques, theoretical models, case formulation approaches, or reflective practice " +
        "frameworks. Filter by the therapist's declared modality to prevent cross-modality content bleeding.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The search query — include technique names or framework terms where known " +
              '(e.g. "Socratic questioning", "formulation", "therapeutic alliance").'
          ),
        modality: z
          .enum(["cbt", "person_centred", "psychodynamic"])
          .describe(
            "The therapeutic modality to filter by. Should match the therapist's declared modality. " +
              "Use cbt for cognitive behavioural therapy, person_centred for Rogerian/humanistic approaches, " +
              "psychodynamic for psychoanalytic/psychodynamic approaches."
          ),
      }),
      execute: async ({ query, modality }) =>
        executeHybridSearch({
          query,
          toolName: "searchTherapeuticContent",
          toolInput: { query, modality },
          category: "therapeutic_content",
          modality,
          // Favour semantic search for therapeutic content — therapists describe
          // techniques in varied language and exact keyword matching is less
          // important than conceptual similarity.
          fullTextWeight: 1.0,
          semanticWeight: 1.2,
          sensitiveCategories,
        }),
    }),

    /**
     * Searches clinical practice and professional documentation content.
     *
     * Pre-sets category to 'clinical_practice'. Both jurisdiction and modality
     * are optional — most clinical practice content is cross-modality, but some
     * documents (e.g. data protection guidance) are jurisdiction-specific, and
     * future content may have modality-flavoured variants.
     */
    searchClinicalPractice: tool({
      description:
        "Search professional practice guidance on clinical documentation, record-keeping, " +
        "treatment planning, progress note formats, data protection in records, disclosure " +
        "protocols, and documentation standards. Use when the therapist asks about HOW TO " +
        "DOCUMENT their work — note-taking structure, what to include in records, consent " +
        "documentation, crisis documentation, or the 'Golden Thread' connecting assessment " +
        "to termination. This differs from searchLegislation (which covers the law itself) " +
        "and searchGuidelines (which covers professional body standards) — clinical practice " +
        "content applies those frameworks to day-to-day documentation practice.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The search query — include documentation-specific terms where known " +
              '(e.g. "SOAP notes", "progress notes", "treatment plan", "Golden Thread", ' +
              '"crisis documentation", "informed consent records").'
          ),
        jurisdiction: z
          .enum(["UK", "EU"])
          .optional()
          .describe(
            "Optional. The therapist's jurisdiction — relevant for documents covering " +
              "data protection, access rights, and statutory record-keeping requirements. " +
              "Omit for general documentation methodology (e.g. note formats, treatment planning)."
          ),
        modality: z
          .enum(["cbt", "person_centred", "psychodynamic"])
          .optional()
          .describe(
            "Optional. Filter by therapeutic modality if relevant. Most clinical practice " +
              "content is cross-modality, but some documentation guidance may have " +
              "modality-specific considerations."
          ),
      }),
      execute: async ({ query, jurisdiction, modality }) =>
        executeHybridSearch({
          query,
          toolName: "searchClinicalPractice",
          toolInput: { query, jurisdiction, modality },
          category: "clinical_practice",
          jurisdiction: jurisdiction ?? null,
          modality: modality ?? null,
          // Slightly semantic-leaning — therapists describe documentation needs
          // in varied language ("how should I write up my sessions" needs to
          // find "Structuring Progress Notes"). But balanced enough that specific
          // terms like "SOAP" or "Golden Thread" still rank well via FTS.
          fullTextWeight: 1.0,
          semanticWeight: 1.1,
          sensitiveCategories,
        }),
    }),
  }) as const;
