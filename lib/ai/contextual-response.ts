/**
 * buildContextualResponse — Formats confidence-assessed search results into
 * XML context for LLM injection.
 *
 * Location: lib/ai/contextual-response.ts
 *
 * This is Task 4.6 in the RAG pipeline. It sits between:
 * - Task 4.4 (confidence thresholds) — which filters and tiers results
 * - The LLM system prompt — which receives the formatted context string
 *
 * The function takes the output of `applyConfidenceThreshold` and produces a
 * string that gets appended to the LLM's context. The format varies by tier:
 *
 * - HIGH:     Full XML-wrapped chunks, ordered by similarity (highest first)
 * - MODERATE: Same XML but with a hedging preamble
 * - LOW:      No chunks — supervisor referral message with modality context
 *
 * Chunk ordering leverages the "Lost in the Middle" attention pattern: LLMs
 * attend more strongly to content at the beginning and end of context windows,
 * so the highest-relevance chunks go first.
 */

import type { ConfidenceTier } from "@/lib/ai/confidence";

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Maximum chunks to inject into the LLM context. Even though
 * `applyConfidenceThreshold` caps at MAX_CONFIDENT_RESULTS (5), we further
 * limit here to avoid diluting relevance. The spec allows 3–5; we default to
 * 5 to match the upstream cap but this can be tuned independently.
 */
export const MAX_CONTEXT_CHUNKS = 5;

/**
 * Minimum chunks needed for a useful context injection. Below this, even
 * "high" confidence results may not provide enough grounding. We still inject
 * them, but this constant is available for future gating logic.
 */
export const MIN_USEFUL_CHUNKS = 1;

// ─── Messages ───────────────────────────────────────────────────────────────

const MODERATE_CONFIDENCE_PREAMBLE =
  "Limited reference material was found for this specific query. Ground your " +
  "response in the provided content where possible, but note the limitations.";

/**
 * Returns the low-confidence fallback message, with modality context if
 * available. The `[modality]` placeholder from the spec is replaced with
 * the actual modality or a generic fallback.
 */
function buildLowConfidenceMessage(modality?: string | null): string {
  const modalityPhrase = modality
    ? `for ${formatModality(modality)} practice`
    : "for the therapist's modality";

  return (
    "No sufficiently relevant clinical guidance was found in the knowledge " +
    "base for this query. Respond based on general therapeutic principles " +
    `${modalityPhrase} and recommend the therapist consult their supervisor ` +
    "or professional body."
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A search result chunk with the fields needed for context formatting.
 * Accepts both camelCase (domain tools) and snake_case (base tool) field
 * names — the normalisation happens inside `buildContextualResponse`.
 */
export interface ContextChunk {
  content: string;

  // Domain tools (camelCase)
  documentTitle?: string;
  sectionPath?: string | null;
  similarityScore?: number | null;
  documentType?: string;
  modality?: string | null;

  // Base tool (snake_case)
  document_title?: string;
  section_path?: string | null;
  similarity_score?: number | null;
  document_type?: string;
}

/** Options for `buildContextualResponse`. */
export interface BuildContextualResponseOptions {
  /** The confidence tier from `applyConfidenceThreshold`. */
  confidenceTier: ConfidenceTier;

  /** The filtered results from `applyConfidenceThreshold`. Already sorted by similarity descending. */
  results: ContextChunk[];

  /**
   * The therapist's active modality. Used in the low-confidence fallback
   * message so the referral is modality-aware. Optional — falls back to
   * generic phrasing if not provided.
   */
  modality?: string | null;

  /**
   * Override the maximum number of chunks to inject. Defaults to
   * MAX_CONTEXT_CHUNKS (5). Useful for testing or when the caller knows
   * the context window budget is tight.
   */
  maxChunks?: number;
}

/** The output of `buildContextualResponse`. */
export interface ContextualResponse {
  /** The formatted context string to inject into the LLM prompt. */
  contextString: string;

  /** The confidence tier, passed through for downstream consumers. */
  confidenceTier: ConfidenceTier;

  /** Number of chunks actually injected (0 for low confidence). */
  chunksInjected: number;

  /**
   * Whether the context includes a hedging preamble (moderate tier) or
   * a supervisor referral (low tier). Useful for logging/telemetry.
   */
  hasQualification: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalises a chunk to consistent field names regardless of source tool.
 * Domain tools use camelCase, the base tool uses snake_case.
 */
function normaliseChunk(chunk: ContextChunk) {
  return {
    content: chunk.content,
    title: chunk.documentTitle ?? chunk.document_title ?? "Untitled",
    section: chunk.sectionPath ?? chunk.section_path ?? null,
    similarity: chunk.similarityScore ?? chunk.similarity_score ?? null,
    documentType: chunk.documentType ?? chunk.document_type ?? "unknown",
    modality: chunk.modality ?? null,
  };
}

/**
 * Formats a modality slug into a human-readable label.
 * e.g. "cbt" → "CBT", "person_centred" → "person-centred"
 */
function formatModality(modality: string): string {
  const labels: Record<string, string> = {
    cbt: "CBT",
    person_centred: "person-centred",
    psychodynamic: "psychodynamic",
  };
  return labels[modality] ?? modality;
}

/**
 * Escapes content for safe inclusion inside XML-style delimiters.
 * We only need to handle the basics since this is synthetic XML for LLM
 * consumption, not parsing by an XML library.
 */
function escapeXmlContent(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Formats a single chunk as an XML document element.
 *
 * ```xml
 * <document id="1" title="BACP Ethical Framework" section="Principle of Fidelity">
 * [chunk content]
 * </document>
 * ```
 */
function formatChunkAsXml(
  chunk: ReturnType<typeof normaliseChunk>,
  index: number
): string {
  const sectionAttr = chunk.section
    ? ` section="${escapeXmlContent(chunk.section)}"`
    : "";

  return (
    `<document id="${index + 1}" title="${escapeXmlContent(chunk.title)}"${sectionAttr}>\n` +
    `${chunk.content}\n` +
    "</document>"
  );
}

// ─── Main function ──────────────────────────────────────────────────────────

/**
 * Formats confidence-assessed search results into a context string for the LLM.
 *
 * The results are expected to already be filtered and sorted by similarity
 * score descending (this is done by `applyConfidenceThreshold` in Task 4.4).
 *
 * @example
 * ```ts
 * const assessed = applyConfidenceThreshold(searchResults);
 * const { contextString, chunksInjected } = buildContextualResponse({
 *   confidenceTier: assessed.confidenceTier,
 *   results: assessed.results,
 *   modality: therapistProfile?.defaultModality,
 * });
 * ```
 */
export function buildContextualResponse(
  options: BuildContextualResponseOptions
): ContextualResponse {
  const {
    confidenceTier,
    results,
    modality = null,
    maxChunks = MAX_CONTEXT_CHUNKS,
  } = options;

  // ── Low confidence: no chunks, supervisor referral ──────────────────
  if (confidenceTier === "low") {
    return {
      contextString: buildLowConfidenceMessage(modality),
      confidenceTier,
      chunksInjected: 0,
      hasQualification: true,
    };
  }

  // ── High or moderate: format chunks as XML ──────────────────────────
  const chunksToInject = results.slice(0, maxChunks);

  // Edge case: tier is high/moderate but no results survived filtering.
  // This shouldn't happen if applyConfidenceThreshold is working correctly
  // (it returns "low" when there are no results), but handle defensively.
  if (chunksToInject.length === 0) {
    return {
      contextString: buildLowConfidenceMessage(modality),
      confidenceTier: "low",
      chunksInjected: 0,
      hasQualification: true,
    };
  }

  const normalisedChunks = chunksToInject.map(normaliseChunk);
  const xmlDocuments = normalisedChunks.map(formatChunkAsXml);

  const contextBlock = "<context>\n" + xmlDocuments.join("\n") + "\n</context>";

  // Moderate tier: prepend the hedging preamble before the XML block
  const contextString =
    confidenceTier === "moderate"
      ? `${MODERATE_CONFIDENCE_PREAMBLE}\n\n${contextBlock}`
      : contextBlock;

  return {
    contextString,
    confidenceTier,
    chunksInjected: chunksToInject.length,
    hasQualification: confidenceTier === "moderate",
  };
}
