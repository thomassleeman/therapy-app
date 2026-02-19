/**
 * Contextual Enrichment Module
 *
 * Implements Anthropic's Contextual Retrieval technique (2024).
 * Before embedding, each chunk is prepended with an LLM-generated context
 * snippet explaining its position in the broader document and resolving
 * ambiguous references (pronouns, "this section", "the above", etc.).
 *
 * Impact: 35–49% reduction in retrieval failures standalone,
 * up to 67% when combined with hybrid search and reranking.
 *
 * Cost: ~$1 per million document tokens (one-time at ingestion).
 *
 * @see https://www.anthropic.com/news/contextual-retrieval
 */

import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentInput {
  /** The chunk text to enrich */
  chunk: string;
  /** The full source document text (used as context for the LLM) */
  fullDocument: string;
  /** Title of the source document */
  documentTitle: string;
  /** Hierarchical position in the document, e.g. "Part II > Section 3" */
  sectionPath?: string;
}

export interface EnrichmentResult {
  /** The enriched text: contextSnippet + "\n\n" + originalChunkText */
  enrichedContent: string;
  /** The generated context snippet (or null if enrichment was skipped/failed) */
  contextSnippet: string | null;
  /** Whether enrichment was actually applied */
  wasEnriched: boolean;
}

export interface BatchEnrichmentOptions {
  /** Skip LLM calls entirely — returns original chunks unchanged. Useful for testing. */
  skipEnrichment?: boolean;
  /** Number of chunks to process per batch. Default: 10 */
  batchSize?: number;
  /** Delay in ms between batches to respect rate limits. Default: 1000 */
  batchDelayMs?: number;
  /** Model to use in gateway format (provider/model). Default: 'openai/gpt-4o-mini' */
  model?: string;
  /** Called after each batch completes */
  onBatchComplete?: (batchIndex: number, totalBatches: number) => void;
}

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

interface CostTracker {
  totalInputTokens: number;
  totalOutputTokens: number;
  chunksProcessed: number;
  chunksSkipped: number;
  chunksFailed: number;
}

const GPT4O_MINI_INPUT_COST_PER_MILLION = 0.15; // $0.15 per 1M input tokens
const GPT4O_MINI_OUTPUT_COST_PER_MILLION = 0.6; // $0.60 per 1M output tokens

function estimateCost(tracker: CostTracker): string {
  const inputCost =
    (tracker.totalInputTokens / 1_000_000) * GPT4O_MINI_INPUT_COST_PER_MILLION;
  const outputCost =
    (tracker.totalOutputTokens / 1_000_000) *
    GPT4O_MINI_OUTPUT_COST_PER_MILLION;
  const totalCost = inputCost + outputCost;

  return [
    "Contextual enrichment cost estimate:",
    `  Chunks processed: ${tracker.chunksProcessed}`,
    `  Chunks skipped:   ${tracker.chunksSkipped}`,
    `  Chunks failed:    ${tracker.chunksFailed}`,
    `  Input tokens:     ${tracker.totalInputTokens.toLocaleString()}`,
    `  Output tokens:    ${tracker.totalOutputTokens.toLocaleString()}`,
    `  Est. input cost:  $${inputCost.toFixed(4)}`,
    `  Est. output cost: $${outputCost.toFixed(4)}`,
    `  Est. total cost:  $${totalCost.toFixed(4)}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildEnrichmentPrompt(
  chunk: string,
  fullDocument: string,
  documentTitle: string,
  sectionPath?: string
): string {
  const sectionInfo = sectionPath
    ? `\nThe chunk comes from: ${sectionPath}`
    : "";

  return `<document title="${documentTitle}">
${fullDocument}
</document>
${sectionInfo}
<chunk>
${chunk}
</chunk>

Generate a short context snippet (50–100 tokens) that:
1. States where this chunk sits within "${documentTitle}" (section, topic area)
2. Resolves any pronouns or vague references ("this", "the above", "as mentioned") to their concrete referents
3. Provides enough context for the chunk to be understood in isolation

Return ONLY the context snippet — no preamble, no labels, no quotes. The snippet will be prepended to the chunk before embedding.`;
}

// ---------------------------------------------------------------------------
// Single-chunk enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single chunk with contextual information using an LLM.
 *
 * The returned `enrichedContent` is what should be embedded — it combines
 * the generated context snippet with the original chunk text.
 */
export async function enrichChunkWithContext(
  input: EnrichmentInput,
  options: { skipEnrichment?: boolean; model?: string } = {}
): Promise<EnrichmentResult> {
  const { chunk, fullDocument, documentTitle, sectionPath } = input;
  const model = options.model ?? "openai/gpt-4o-mini";

  // Fast path: skip enrichment for testing
  if (options.skipEnrichment) {
    return {
      enrichedContent: chunk,
      contextSnippet: null,
      wasEnriched: false,
    };
  }

  try {
    const { text, usage } = await generateText({
      model: gateway(model),
      system:
        "You are a precise document analyst. Generate concise context snippets for document chunks to improve search retrieval. Be factual and specific. Never include meta-commentary — output only the context snippet itself.",
      prompt: buildEnrichmentPrompt(
        chunk,
        fullDocument,
        documentTitle,
        sectionPath
      ),
      maxOutputTokens: 150, // cap output — we want 50–100 tokens
      temperature: 0, // deterministic for reproducibility
    });

    const contextSnippet = text.trim();

    return {
      enrichedContent: `${contextSnippet}\n\n${chunk}`,
      contextSnippet,
      wasEnriched: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[contextual-enrichment] Failed to enrich chunk (falling back to original): ${message}`
    );

    return {
      enrichedContent: chunk,
      contextSnippet: null,
      wasEnriched: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Batch enrichment with rate limiting
// ---------------------------------------------------------------------------

/**
 * Enrich an array of chunks in batches with rate limiting and cost tracking.
 *
 * Chunks are processed in configurable batches (default 10) with a delay
 * between each batch to avoid hitting API rate limits. Failed chunks
 * gracefully fall back to their original text.
 *
 * @example
 * ```ts
 * const results = await enrichChunksInBatches(
 *   chunks.map((c) => ({
 *     chunk: c.content,
 *     fullDocument: docText,
 *     documentTitle: 'BACP Ethical Framework',
 *     sectionPath: c.sectionPath,
 *   })),
 *   {
 *     skipEnrichment: process.argv.includes('--skip-context'),
 *     onBatchComplete: (i, total) =>
 *       console.log(`  Batch ${i + 1}/${total} complete`),
 *   },
 * );
 * ```
 */
export async function enrichChunksInBatches(
  inputs: EnrichmentInput[],
  options: BatchEnrichmentOptions = {}
): Promise<EnrichmentResult[]> {
  const {
    skipEnrichment = false,
    batchSize = 10,
    batchDelayMs = 1000,
    model = "openai/gpt-4o-mini",
    onBatchComplete,
  } = options;

  // Fast path: skip all enrichment
  if (skipEnrichment) {
    console.log(
      `[contextual-enrichment] Skipping enrichment for ${inputs.length} chunks (skipEnrichment=true)`
    );
    return inputs.map((input) => ({
      enrichedContent: input.chunk,
      contextSnippet: null,
      wasEnriched: false,
    }));
  }

  const totalBatches = Math.ceil(inputs.length / batchSize);
  const results: EnrichmentResult[] = [];
  const tracker: CostTracker = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    chunksProcessed: 0,
    chunksSkipped: 0,
    chunksFailed: 0,
  };

  console.log(
    `[contextual-enrichment] Enriching ${inputs.length} chunks in ${totalBatches} batches of ${batchSize}`
  );

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * batchSize;
    const batch = inputs.slice(start, start + batchSize);

    // Process all chunks in this batch concurrently
    const batchResults = await Promise.all(
      batch.map(async (input) => {
        try {
          const { text, usage } = await generateText({
            model: gateway(model),
            system:
              "You are a precise document analyst. Generate concise context snippets for document chunks to improve search retrieval. Be factual and specific. Never include meta-commentary — output only the context snippet itself.",
            prompt: buildEnrichmentPrompt(
              input.chunk,
              input.fullDocument,
              input.documentTitle,
              input.sectionPath
            ),
            maxOutputTokens: 150,
            temperature: 0,
          });

          // Track token usage for cost estimation
          if (usage) {
            tracker.totalInputTokens += usage.inputTokens ?? 0;
            tracker.totalOutputTokens += usage.outputTokens ?? 0;
          }
          tracker.chunksProcessed++;

          const contextSnippet = text.trim();
          return {
            enrichedContent: `${contextSnippet}\n\n${input.chunk}`,
            contextSnippet,
            wasEnriched: true,
          } satisfies EnrichmentResult;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `[contextual-enrichment] Chunk enrichment failed (batch ${batchIndex + 1}): ${message}`
          );
          tracker.chunksFailed++;

          return {
            enrichedContent: input.chunk,
            contextSnippet: null,
            wasEnriched: false,
          } satisfies EnrichmentResult;
        }
      })
    );

    results.push(...batchResults);
    onBatchComplete?.(batchIndex, totalBatches);

    // Rate-limit delay between batches (skip after last batch)
    if (batchIndex < totalBatches - 1) {
      await delay(batchDelayMs);
    }
  }

  // Log cost summary
  console.log(`\n${estimateCost(tracker)}\n`);

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
