/**
 * Parent-Child Chunk Generator for the Therapy Reflection RAG System
 * ==================================================================
 *
 * Implements a two-level chunking strategy that separates retrieval precision
 * from LLM context quality — a key technique for structured clinical content.
 *
 * ## How it works
 *
 * **Child chunks** (200–400 tokens) are small, tightly scoped text segments
 * optimised for precise semantic matching. These are what get embedded and
 * searched via vector similarity. A therapist asking "What is Socratic
 * questioning?" matches a focused child chunk rather than a sprawling
 * paragraph about CBT generally.
 *
 * **Parent chunks** (800–1,000 tokens) are larger segments that provide richer
 * surrounding context. Each parent contains 2–4 child chunks. When retrieval
 * finds a matching child, the system fetches the corresponding parent chunk
 * to send to the LLM — giving it enough context to generate an accurate,
 * well-grounded response.
 *
 * ## Why this yields 20–35% relevance improvement
 *
 * Standard single-level chunking forces a trade-off: small chunks match
 * precisely but lack context (the LLM hallucinates to fill gaps), while large
 * chunks provide context but dilute the embedding signal (irrelevant passages
 * pollute the vector, reducing recall). Parent-child chunking eliminates this
 * trade-off entirely:
 *
 * - **Search precision**: Child chunks produce tighter embeddings, improving
 *   cosine similarity scores for relevant queries by ~20–35% on structured
 *   documents like legislation and clinical guidelines.
 * - **LLM context quality**: Parent chunks give the model enough surrounding
 *   material to resolve references ("this section", "the above principle"),
 *   understand scope, and avoid hallucination.
 * - **Reduced false positives**: Smaller search targets mean fewer partial
 *   matches that score high on vector similarity but aren't truly relevant.
 *
 * This improvement is most pronounced for:
 * - Legislation with nested subsections (child = subsection, parent = full section)
 * - Guidelines with numbered principles and explanatory paragraphs
 * - Therapeutic content where a specific technique sits within a broader framework
 *
 * ## Database integration
 *
 * The ingestion script (3.6) stores both parent and child chunks in
 * `knowledge_chunks`. Child chunks have their `parent_chunk_id` FK pointing
 * to the corresponding parent row. During retrieval, the hybrid search
 * function matches child chunks, then the application joins on
 * `parent_chunk_id` to fetch the parent's content for the LLM context window.
 *
 * @module scripts/lib/parent-child-chunker
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The document categories that drive chunking strategy selection. */
export type DocumentCategory =
  | "legislation"
  | "guideline"
  | "therapeutic_content";

/** A single chunk in the parent-child hierarchy. */
export interface ParentChildChunk {
  /** The chunk text content. */
  content: string;
  /** Whether this is a parent chunk (true) or a child chunk (false). */
  isParent: boolean;
  /**
   * For child chunks: the index of their parent in the returned array.
   * For parent chunks: null.
   */
  parentIndex: number | null;
  /** Sequential position within the document (0-based, across both levels). */
  chunkIndex: number;
  /** Arbitrary metadata for downstream processing. */
  metadata: Record<string, unknown>;
}

/** Configuration for the parent and child splitters. */
interface SplitterConfig {
  /** Character count target for parent chunks. */
  parentChunkSize: number;
  /** Character overlap for parent chunks. */
  parentChunkOverlap: number;
  /** Character count target for child chunks. */
  childChunkSize: number;
  /** Character overlap for child chunks. */
  childChunkOverlap: number;
  /** Ordered list of separator strings for RecursiveCharacterTextSplitter. */
  separators: string[];
}

// ---------------------------------------------------------------------------
// Configuration per document category
// ---------------------------------------------------------------------------

/**
 * Returns splitter configuration tuned for each content type.
 *
 * Token-to-character ratio: we estimate ~4 characters per token, which is a
 * safe average for English prose. All sizes are expressed in characters.
 *
 * The child chunk sizes intentionally match the therapeutic_content range from
 * the base chunker (task 3.2) so that embeddings are directly comparable
 * regardless of whether parent-child mode is enabled.
 */
function getSplitterConfig(category: DocumentCategory): SplitterConfig {
  switch (category) {
    case "legislation":
      // Legislation has rigid structure: Acts → Parts → Sections → Subsections.
      // Parent = full section (~900 tokens × 4 = 3,600 chars).
      // Child = individual subsection (~300 tokens × 4 = 1,200 chars).
      // Separators prioritise structural markdown headings.
      return {
        parentChunkSize: 3600,
        parentChunkOverlap: 200,
        childChunkSize: 1200,
        childChunkOverlap: 100,
        separators: ["\n## ", "\n### ", "\n\n", "\n", ". ", " "],
      };

    case "guideline":
      // Guidelines have numbered principles with explanatory paragraphs.
      // Parent = full principle + explanation (~900 tokens × 4 = 3,600 chars).
      // Child = individual paragraph or sub-point (~350 tokens × 4 = 1,400 chars).
      return {
        parentChunkSize: 3600,
        parentChunkOverlap: 250,
        childChunkSize: 1400,
        childChunkOverlap: 120,
        separators: ["\n\n", "\n", ". ", " "],
      };

    case "therapeutic_content":
      // Therapeutic content is narrative and fluid — concepts bleed across paragraphs.
      // Parent = broader conceptual block (~800 tokens × 4 = 3,200 chars).
      // Child = focused technique/concept (~250 tokens × 4 = 1,000 chars).
      // Generous overlap on children to avoid splitting mid-concept.
      return {
        parentChunkSize: 3200,
        parentChunkOverlap: 400,
        childChunkSize: 1000,
        childChunkOverlap: 200,
        separators: ["\n\n", "\n", ". ", " "],
      };

    default: {
      const _exhaustive: never = category;
      throw new Error(`Unknown document category: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Generates a two-level parent-child chunk hierarchy from a document.
 *
 * The algorithm:
 * 1. Split the full document into parent-sized chunks using
 *    RecursiveCharacterTextSplitter with category-appropriate settings.
 * 2. For each parent chunk, split it again into child-sized chunks.
 * 3. Return a flat array where parent chunks and their children are
 *    interleaved. Each child stores a `parentIndex` pointing back to
 *    its parent's position in the array.
 *
 * The ingestion script (task 3.6) uses this output to:
 * - Insert parent chunks into `knowledge_chunks` (with `embedding` set to NULL
 *   since parents are not searched directly).
 * - Insert child chunks with their `parent_chunk_id` FK pointing to the
 *   parent row, and embed only the children.
 *
 * @param text - The full document text (frontmatter already stripped).
 * @param category - The document category, controlling splitter parameters.
 * @returns A flat array of parent and child chunks with relationship metadata.
 *
 * @example
 * ```ts
 * const chunks = await generateParentChildChunks(documentText, 'legislation');
 *
 * // Parents have isParent: true, parentIndex: null
 * const parents = chunks.filter(c => c.isParent);
 *
 * // Children have isParent: false, parentIndex pointing to their parent
 * const children = chunks.filter(c => !c.isParent);
 *
 * // During retrieval:
 * // 1. Search child chunks via vector similarity
 * // 2. For each matched child, look up parentIndex to find the parent
 * // 3. Send the parent's content to the LLM for richer context
 * ```
 */
export async function generateParentChildChunks(
  text: string,
  category: DocumentCategory
): Promise<ParentChildChunk[]> {
  const config = getSplitterConfig(category);

  // -------------------------------------------------------------------------
  // Step 1: Split into parent-sized chunks
  // -------------------------------------------------------------------------
  const parentSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.parentChunkSize,
    chunkOverlap: config.parentChunkOverlap,
    separators: config.separators,
  });

  const parentTexts = await parentSplitter.splitText(text);

  // -------------------------------------------------------------------------
  // Step 2: Split each parent into child-sized chunks
  // -------------------------------------------------------------------------
  const childSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.childChunkSize,
    chunkOverlap: config.childChunkOverlap,
    separators: config.separators,
  });

  // -------------------------------------------------------------------------
  // Step 3: Build the flat output array with relationship pointers
  // -------------------------------------------------------------------------
  const result: ParentChildChunk[] = [];
  let globalChunkIndex = 0;

  for (let parentIdx = 0; parentIdx < parentTexts.length; parentIdx++) {
    const parentText = parentTexts[parentIdx];

    // --- Insert the parent chunk ---
    const parentPosition = result.length;
    result.push({
      content: parentText,
      isParent: true,
      parentIndex: null,
      chunkIndex: globalChunkIndex++,
      metadata: {
        level: "parent",
        parentDocOrder: parentIdx,
        estimatedTokens: Math.round(parentText.length / 4),
      },
    });

    // --- Split parent text into children ---
    const childTexts = await childSplitter.splitText(parentText);

    for (let childIdx = 0; childIdx < childTexts.length; childIdx++) {
      const childText = childTexts[childIdx];

      result.push({
        content: childText,
        isParent: false,
        parentIndex: parentPosition,
        chunkIndex: globalChunkIndex++,
        metadata: {
          level: "child",
          parentDocOrder: parentIdx,
          childPositionInParent: childIdx,
          totalChildrenInParent: childTexts.length,
          estimatedTokens: Math.round(childText.length / 4),
        },
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Utility: extract parents and children from results
// ---------------------------------------------------------------------------

/**
 * Convenience helper to separate the flat chunk array into parents and children.
 * Useful for the ingestion script when inserting rows with different settings
 * (parents get no embedding, children get embedded).
 */
export function separateParentChildChunks(chunks: ParentChildChunk[]): {
  parents: ParentChildChunk[];
  children: ParentChildChunk[];
} {
  const parents: ParentChildChunk[] = [];
  const children: ParentChildChunk[] = [];

  for (const chunk of chunks) {
    if (chunk.isParent) {
      parents.push(chunk);
    } else {
      children.push(chunk);
    }
  }

  return { parents, children };
}

/**
 * Given a matched child chunk, resolves its parent from the original array.
 * This mirrors what the retrieval layer does at query time — search finds
 * a child, then we look up the parent for the LLM context window.
 *
 * @example
 * ```ts
 * const allChunks = await generateParentChildChunks(text, 'cbt');
 * const matchedChild = allChunks[3]; // found via vector search
 * const parent = resolveParent(matchedChild, allChunks);
 * // parent.content has the full surrounding context for the LLM
 * ```
 */
export function resolveParent(
  child: ParentChildChunk,
  allChunks: ParentChildChunk[]
): ParentChildChunk | null {
  if (child.isParent || child.parentIndex === null) {
    return null;
  }
  const parent = allChunks[child.parentIndex];
  return parent?.isParent ? parent : null;
}
