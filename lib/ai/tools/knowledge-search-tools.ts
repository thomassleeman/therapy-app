/**
 * Domain-specific knowledge base search tools for the therapy reflection RAG system.
 *
 * These specialised tools wrap the shared `hybrid_search` Supabase RPC function,
 * each pre-setting the content category, tuning search weights, and enforcing
 * the appropriate filters for its domain. The LLM can call multiple tools in a
 * single turn for cross-domain questions (e.g. "What CBT techniques help with
 * anxiety, and what confidentiality obligations apply?").
 *
 * All three tools plus the general `searchKnowledgeBase` are registered in the
 * `streamText` call so the model can route queries intelligently.
 */

import { openai } from "@ai-sdk/openai";
import { embed, tool } from "ai";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { applyConfidenceThreshold } from "@/lib/ai/confidence";
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
  category?: string | null;
  modality?: string | null;
  jurisdiction?: string | null;
  matchCount?: number;
  fullTextWeight?: number;
  semanticWeight?: number;
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
 * RPC contract, and error handling live in one place.
 */
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
    model: openai.embedding("text-embedding-3-small", { dimensions: 512 }),
    value: query,
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
    rrf_k: 60, // Standard RRF smoothing constant
  });

  if (error) {
    console.error(`[hybrid_search] ${error.message}`, {
      category,
      modality,
      jurisdiction,
    });
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

  return {
    results: assessed.results,
    confidenceTier: assessed.confidenceTier,
    confidenceNote: assessed.confidenceNote,
    averageSimilarity: assessed.averageSimilarity,
    maxSimilarity: assessed.maxSimilarity,
  };
}

// ─── Tool definitions ───────────────────────────────────────────────────────

/**
 * Searches practitioner-oriented legislation briefings.
 *
 * Pre-sets category to 'legislation' and bumps `full_text_weight` to 1.5 so
 * exact statutory references ("Section 117", "Data Protection Act") rank higher
 * in the RRF fusion. Requires `jurisdiction` so results are scoped to the
 * therapist's legal context — the LLM should read this from the therapist's
 * profile or ask if unclear.
 */
export const searchLegislation = tool({
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
      category: "legislation",
      jurisdiction,
      // Slightly stronger full-text weighting so exact statutory terms
      // (e.g. "Section 117", "Schedule 1") are not diluted by semantic neighbours.
      fullTextWeight: 1.5,
      semanticWeight: 1.0,
    }),
});

/**
 * Searches professional body clinical guidelines.
 *
 * Pre-sets category to 'guideline'. Accepts an optional `jurisdiction` to scope
 * results to the therapist's regulatory body — BACP/UKCP/HCPC for UK, relevant
 * EU bodies for EU-based therapists. When omitted, guidelines from all
 * jurisdictions are returned (useful for comparative questions).
 */
export const searchGuidelines = tool({
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
      category: "guideline",
      jurisdiction: jurisdiction ?? null,
      // Balanced weights — guideline language is a mix of precise terms
      // ("fitness to practise") and broader ethical concepts.
      fullTextWeight: 1.0,
      semanticWeight: 1.0,
    }),
});

/**
 * Searches therapeutic technique and framework content.
 *
 * Pre-sets category to 'therapeutic_content'. Requires `modality` to prevent
 * cross-modality content bleeding — a CBT query should not surface
 * psychodynamic techniques unless the therapist explicitly wants a comparison
 * (in which case they can call the tool twice with different modalities).
 */
export const searchTherapeuticContent = tool({
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
      category: "therapeutic_content",
      modality,
      // Favour semantic search for therapeutic content — therapists describe
      // techniques in varied language and exact keyword matching is less
      // important than conceptual similarity.
      fullTextWeight: 1.0,
      semanticWeight: 1.2,
    }),
});

// ─── Tool map for streamText registration ───────────────────────────────────

type KnowledgeSearchToolsProps = {
  session: Session;
};

/**
 * Factory returning all domain-specific search tools, ready to spread into the
 * `tools` parameter of `streamText`. Accepts `session` for consistency with the
 * other tool factories and future use (e.g. audit logging, rate limiting).
 * Import and use as:
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
 *     ...knowledgeSearchTools({ session }),
 *     // ... other tools
 *   },
 *   stopWhen: stepCountIs(5), // Allow multi-tool calls for cross-domain questions
 * });
 * ```
 */
export const knowledgeSearchTools = ({ session: _session }: KnowledgeSearchToolsProps) =>
  ({
    searchLegislation,
    searchGuidelines,
    searchTherapeuticContent,
  }) as const;
