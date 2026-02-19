/**
 * Content-type-specific chunking functions for the therapy reflection RAG system.
 *
 * Two distinct chunking strategies serve three content categories:
 *
 * 1. **Legislation** and **Clinical guidelines** — Both use the same recursive
 *    section-aware chunking (400–600 tokens, 15–20% overlap). Legislation content
 *    in this system is authored as practitioner-oriented briefings, not raw statutory
 *    text, so it shares the same prose structure as guidelines. The `legislation`
 *    category is preserved for retrieval filtering (jurisdiction scoping, superseded
 *    document exclusion), not for chunking differences.
 *
 * 2. **Therapeutic modality content** (CBT techniques, person-centred theory) —
 *    Semantic/sliding window with generous overlap. Smaller chunks enable precise
 *    technique-level matching; high overlap preserves cross-paragraph concepts.
 *
 * All functions use LangChain's RecursiveCharacterTextSplitter with tuned parameters.
 * Token estimates use ~4 chars per token (conservative for English clinical text).
 *
 * @module scripts/lib/chunker
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Conservative chars-per-token estimate for English clinical/legal text. */
const CHARS_PER_TOKEN = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single chunk produced by any chunking strategy. */
export interface Chunk {
  /** The text content of this chunk. */
  content: string;
  /** Zero-based position of this chunk within the document. */
  chunkIndex: number;
  /** Strategy-specific metadata attached to the chunk. */
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  /** Which chunking strategy produced this chunk. */
  strategy: "legislation" | "guideline" | "therapeutic_content";
  /** Character offset where this chunk starts in the original text. */
  charStart: number;
  /** Character offset where this chunk ends in the original text. */
  charEnd: number;
  /** Approximate token count (chars / CHARS_PER_TOKEN). */
  estimatedTokens: number;
}

/** The three document categories that drive chunking strategy selection. */
export type DocumentCategory =
  | "legislation"
  | "guideline"
  | "therapeutic_content";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build chunk objects from raw text splits, tracking character offsets
 * against the original document.
 */
function buildChunks(
  originalText: string,
  splits: string[],
  strategy: ChunkMetadata["strategy"]
): Chunk[] {
  const chunks: Chunk[] = [];
  let searchFrom = 0;

  for (let i = 0; i < splits.length; i++) {
    const content = splits[i];
    const charStart = originalText.indexOf(content, searchFrom);
    const charEnd =
      charStart === -1
        ? searchFrom + content.length
        : charStart + content.length;

    // Advance search cursor — but allow overlap (don't jump past charEnd)
    if (charStart !== -1) {
      searchFrom = charStart + 1;
    }

    chunks.push({
      content,
      chunkIndex: i,
      metadata: {
        strategy,
        charStart: Math.max(charStart, 0),
        charEnd,
        estimatedTokens: Math.round(content.length / CHARS_PER_TOKEN),
      },
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// 1. Legislation chunking
// ---------------------------------------------------------------------------

/**
 * Chunking for legislation briefings (Data Protection Act, GDPR, Mental Health Act).
 *
 * Delegates to {@link chunkGuidelines} internally. Legislation content in this system
 * is authored as practitioner-oriented briefings — not raw statutory text — so the
 * content structure is the same as clinical guidelines: section-based prose with
 * numbered references and inline statutory citations. The same chunking strategy
 * (400–600 tokens, 15–20% overlap, section-boundary-aware separators) works well
 * for both.
 *
 * The `legislation` category is preserved as a separate document type for retrieval
 * filtering (e.g. scoping by jurisdiction, excluding superseded documents), not
 * because it needs a different chunking approach.
 *
 * @param text - The legislation briefing text (markdown, authored for therapists).
 * @returns Array of chunks using the guidelines chunking strategy.
 */
export async function chunkLegislation(text: string): Promise<Chunk[]> {
  const chunks = await chunkGuidelines(text);

  // Re-tag strategy so downstream code can distinguish document category
  return chunks.map((chunk) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      strategy: "legislation" as const,
    },
  }));
}

// ---------------------------------------------------------------------------
// 2. Guidelines chunking
// ---------------------------------------------------------------------------

/**
 * Recursive chunking for clinical guidelines (BACP Ethical Framework, UKCP, NICE).
 *
 * **Why these parameters?**
 * - **400–600 tokens (1600–2400 chars):** Guidelines are structured around discrete
 *   principles or recommendations. Each principle typically spans 1–3 paragraphs.
 *   This range captures a complete principle with its explanation while keeping
 *   embeddings focused enough for precise retrieval.
 * - **15–20% overlap (~360 chars):** Higher than legislation because guideline
 *   principles often reference each other narratively. The overlap preserves these
 *   cross-references so a therapist querying "informed consent" also retrieves context
 *   about the related "contracting" principle.
 * - **Separators `["\n\n", "\n", ". ", " "]`:** Double newlines respect paragraph
 *   boundaries (the natural unit of guidelines writing). The period separator prevents
 *   mid-sentence splits when paragraphs exceed the chunk size.
 * - **Numbered principle boundaries:** The post-processing step detects patterns like
 *   "1.", "Principle 1:", or "1.2.3" and avoids splitting within a numbered section.
 *
 * @param text - The full guideline document text (markdown).
 * @returns Array of chunks respecting principle/section boundaries.
 */
export async function chunkGuidelines(text: string): Promise<Chunk[]> {
  const chunkSize = 2000; // ~500 tokens — midpoint of 400–600 token range
  const chunkOverlap = 360; // ~18% overlap — midpoint of 15–20%

  // First, try to split on principle/section boundaries
  const preProcessed = insertBoundaryMarkers(text);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: [
      "\n---PRINCIPLE_BOUNDARY---\n", // Injected boundary markers (stripped later)
      "\n\n",
      "\n",
      ". ",
      " ",
    ],
    keepSeparator: false,
  });

  const splits = await splitter.splitText(preProcessed);

  // Clean out any remaining boundary markers from the chunks
  const cleanedSplits = splits
    .map((s) => s.replace(/\n?---PRINCIPLE_BOUNDARY---\n?/g, "\n").trim())
    .filter((s) => s.length > 0);

  return buildChunks(text, cleanedSplits, "guideline");
}

/**
 * Insert boundary markers before numbered principles/sections to guide the
 * splitter toward respecting these natural boundaries.
 *
 * Detects patterns like:
 * - "1. ", "2. ", "10. " (numbered lists)
 * - "Principle 1:", "Standard 3.2:" (named principles)
 * - "1.2.3 " (hierarchical numbering)
 */
function insertBoundaryMarkers(text: string): string {
  // Match the start of numbered sections/principles on their own line
  return text
    .replace(
      /\n(?=(?:Principle|Standard|Section|Guideline|Recommendation)\s+\d)/gi,
      "\n---PRINCIPLE_BOUNDARY---\n"
    )
    .replace(
      // Also mark standalone numbered items that start a new paragraph
      /\n\n(?=\d{1,3}\.\s)/g,
      "\n\n---PRINCIPLE_BOUNDARY---\n"
    );
}

// ---------------------------------------------------------------------------
// 3. Therapeutic content chunking
// ---------------------------------------------------------------------------

/**
 * Semantic/sliding window chunking for therapeutic modality content
 * (CBT techniques, person-centred theory, psychodynamic concepts).
 *
 * **Why these parameters?**
 * - **200–400 tokens (800–1600 chars):** Therapeutic content needs precise
 *   technique-level matching. A therapist querying "Socratic questioning" should
 *   retrieve a chunk specifically about that technique, not a broad chunk covering
 *   all of CBT. Smaller chunks produce more focused embeddings that match specific
 *   clinical queries with higher cosine similarity.
 * - **20–50% overlap (~420 chars / ~35%):** The most generous overlap of any strategy.
 *   Therapeutic content is narrative — concepts flow across paragraphs without hard
 *   structural boundaries. A technique explained across two paragraphs must appear
 *   fully in at least one chunk. High overlap trades storage efficiency for
 *   significantly better retrieval of cross-paragraph concepts.
 * - **Separators `["\n\n", "\n", ". ", " "]`:** Standard recursive separators.
 *   The double-newline priority respects the natural paragraph structure of Aaron's
 *   authored content (one topic per file, ~1000–2000 words each).
 *
 * @param text - The therapeutic content text (markdown, authored by clinical expert).
 * @returns Array of overlapping chunks optimised for precise semantic matching.
 */
export async function chunkTherapeuticContent(text: string): Promise<Chunk[]> {
  const chunkSize = 1200; // ~300 tokens — midpoint of 200–400 token range
  const chunkOverlap = 420; // ~35% overlap — midpoint of 20–50%

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n\n", "\n", ". ", " "],
    keepSeparator: true,
  });

  const splits = await splitter.splitText(text);

  return buildChunks(text, splits, "therapeutic_content");
}

// ---------------------------------------------------------------------------
// 4. Dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch to the appropriate chunking strategy based on document category.
 *
 * This is the primary entry point for the ingestion pipeline. It selects the
 * correct chunking function based on the document's `category` field (which
 * maps directly to the `knowledge_documents.category` column in the database).
 *
 * Note: `legislation` and `guideline` both use the same underlying chunking
 * strategy — the category distinction exists for retrieval filtering, not
 * chunking behaviour.
 *
 * @param text     - The full document text to chunk.
 * @param category - One of 'legislation', 'guideline', 'therapeutic_content'.
 * @returns Array of chunks with strategy-appropriate metadata.
 *
 * @example
 * ```ts
 * const chunks = await chunkDocument(legislationText, "legislation");
 * ```
 */
export function chunkDocument(
  text: string,
  category: DocumentCategory
): Promise<Chunk[]> {
  switch (category) {
    case "legislation":
      return chunkLegislation(text);
    case "guideline":
      return chunkGuidelines(text);
    case "therapeutic_content":
      return chunkTherapeuticContent(text);
    default: {
      const exhaustiveCheck: never = category;
      throw new Error(`Unknown document category: ${exhaustiveCheck}`);
    }
  }
}
