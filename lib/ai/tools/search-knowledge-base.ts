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
import type { Session } from "@/lib/auth";
import { DOCUMENT_CATEGORIES, JURISDICTIONS, MODALITIES } from "@/lib/types/knowledge";
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
};

// ---------------------------------------------------------------------------
// Tool definition (factory pattern)
// ---------------------------------------------------------------------------
export const searchKnowledgeBase = ({ session }: SearchKnowledgeBaseProps) =>
  tool({
    description:
      "Search the clinical knowledge base of legislation, ethical guidelines, " +
      "and therapeutic framework content. Use this when the therapist asks about " +
      "specific techniques, ethical obligations, legal requirements, or clinical " +
      "frameworks. Always search before providing clinical guidance.",

    parameters: z.object({
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
            'HCPC), "therapeutic_content" for technique/framework queries. Omit ' +
            "to search across all categories."
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
      // ----------------------------------------------------------------
      // Step 1: Create the authenticated Supabase client
      // This uses the SSR-aware client from utils/supabase/server.ts which
      // reads the user's session from cookies. The RLS policies on
      // knowledge_documents and knowledge_chunks grant SELECT only to the
      // `authenticated` role, and EXECUTE on hybrid_search is likewise
      // restricted — so an unauthenticated client would get empty results.
      // ----------------------------------------------------------------
      const supabase = await createClient();

      // ----------------------------------------------------------------
      // Step 2: Generate query embedding
      // Using text-embedding-3-small truncated to 512 dimensions via
      // Matryoshka Representation Learning. This MUST match the dimensions
      // used during ingestion — mismatched dimensions will silently
      // produce garbage similarity scores.
      // ----------------------------------------------------------------
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small", { dimensions: 512 }),
        value: query,
      });

      // ----------------------------------------------------------------
      // Step 3: Call the hybrid_search RPC
      // This function runs semantic search (pgvector cosine distance) and
      // full-text search (tsvector + ts_rank_cd) in parallel CTEs, then
      // merges results using Reciprocal Rank Fusion (RRF).
      //
      // The embedding must be passed as a string-encoded array because
      // Supabase RPC doesn't natively handle vector types in parameters.
      //
      // The RPC now JOINs knowledge_documents to return document_title
      // alongside chunk data — see the companion migration amendment.
      // ----------------------------------------------------------------
      const { data, error } = await supabase.rpc("hybrid_search", {
        query_text: query,
        query_embedding: `[${embedding.join(",")}]`,
        match_count: 5,
        filter_category: category ?? null,
        filter_modality: modality ?? null,
        filter_jurisdiction: jurisdiction ?? null,
      });

      if (error) {
        console.error("[searchKnowledgeBase] hybrid_search RPC error:", error);
        return {
          results: [],
          error:
            "Knowledge base search failed. Please try rephrasing your query.",
        };
      }

      const results = (data as HybridSearchResult[]) ?? [];

      // ----------------------------------------------------------------
      // Step 4: Shape the response for the LLM
      // Return structured results the model can cite. We include the
      // similarity_score so the model (and downstream safety logic) can
      // assess retrieval confidence — low scores suggest the knowledge
      // base may not contain relevant content for this query.
      // ----------------------------------------------------------------
      return {
        results: results.map((chunk) => ({
          content: chunk.content,
          section_path: chunk.section_path,
          document_title: chunk.document_title,
          document_type: chunk.document_type,
          modality: chunk.modality,
          jurisdiction: chunk.jurisdiction,
          similarity_score: chunk.similarity_score,
          rrf_score: chunk.combined_rrf_score,
          metadata: chunk.metadata,
        })),
        result_count: results.length,
        query_used: query,
        filters_applied: {
          category: category ?? "all",
          modality: modality ?? "all",
          jurisdiction: jurisdiction ?? "all",
        },
      };
    },
  });
