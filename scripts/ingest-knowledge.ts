#!/usr/bin/env tsx
/**
 * Knowledge Base Ingestion Script
 * ================================
 *
 * Processes markdown files from the knowledge base into embedded, searchable
 * chunks stored in Supabase. Each document goes through:
 *
 *   1. Frontmatter parsing (title, category, jurisdiction, modality, etc.)
 *   2. Content-type-specific chunking (legislation/guidelines → recursive,
 *      therapeutic content → semantic with generous overlap)
 *   3. Optional parent-child chunk generation (--with-parents)
 *   4. Optional contextual enrichment via LLM (--with-context)
 *   5. Embedding generation (text-embedding-3-small @ 512 dimensions)
 *   6. Upsert into Supabase (knowledge_documents + knowledge_chunks)
 *
 * Usage:
 *   pnpm ingest                          # Full ingestion
 *   pnpm ingest --dry-run                # Parse and chunk only, no DB writes
 *   pnpm ingest --with-context           # Enable LLM contextual enrichment
 *   pnpm ingest --with-parents           # Enable parent-child chunking
 *   pnpm ingest --dir path/to/docs       # Override knowledge base directory
 *
 * Environment variables (from .env.local):
 *   SUPABASE_URL              — Supabase project URL (falls back to
 *                                NEXT_PUBLIC_SUPABASE_URL if not set)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
 *   OPENAI_API_KEY            — OpenAI API key for embeddings
 *
 * @module scripts/ingest-knowledge
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { embedMany } from "ai";
import { config } from "dotenv";
import matter from "gray-matter";
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type DocumentFrontmatter,
  type DocumentTags,
  JURISDICTIONS,
  type Jurisdiction,
  MODALITIES,
  type Modality,
} from "../lib/types/knowledge";
import type { Chunk } from "./lib/chunker";
import { chunkDocument } from "./lib/chunker";
import type { EnrichmentInput } from "./lib/contextual-enrichment";
import { enrichChunksInBatches } from "./lib/contextual-enrichment";
import type { ParentChildChunk } from "./lib/parent-child-chunker";
import {
  generateParentChildChunks,
  separateParentChildChunks,
} from "./lib/parent-child-chunker";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

config({ path: ".env.local" });

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function validateEnv(): void {
  const missing: string[] = [];
  if (!SUPABASE_URL) {
    missing.push("SUPABASE_URL");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Ensure these are set in .env.local"
    );
  }
}

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

interface CliFlags {
  dryRun: boolean;
  withContext: boolean;
  withParents: boolean;
  dir: string;
}

function parseFlags(): CliFlags {
  const args = process.argv.slice(2);
  const flags: CliFlags = {
    dryRun: false,
    withContext: false,
    withParents: false,
    dir: "knowledge-base",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--with-context":
        flags.withContext = true;
        break;
      case "--with-parents":
        flags.withParents = true;
        break;
      case "--dir":
        i++;
        if (!args[i]) {
          throw new Error("--dir requires a path argument");
        }
        flags.dir = args[i];
        break;
      default:
        console.warn(`Unknown flag: ${args[i]}`);
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A chunk ready for embedding and insertion. */
interface PreparedChunk {
  content: string;
  chunkIndex: number;
  sectionPath: string | null;
  metadata: Record<string, unknown>;
  isParent: boolean;
  /** Index of parent in the prepared chunks array (for parent-child mode). */
  parentLocalIndex: number | null;
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

// OpenAI text-embedding-3-small pricing as of Feb 2025
const EMBEDDING_COST_PER_MILLION_TOKENS = 0.02; // $0.02 per 1M tokens
const CHARS_PER_TOKEN_ESTIMATE = 4;

function estimateEmbeddingCost(totalChars: number): number {
  const estimatedTokens = totalChars / CHARS_PER_TOKEN_ESTIMATE;
  return (estimatedTokens / 1_000_000) * EMBEDDING_COST_PER_MILLION_TOKENS;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively find all .md files under a directory.
 */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

function parseFrontmatter(
  filePath: string,
  raw: string
): { frontmatter: DocumentFrontmatter; content: string } {
  const { data, content } = matter(raw);

  // ── Required fields ───────────────────────────────────────────────────
  if (!data.title || typeof data.title !== "string") {
    throw new Error(`Missing or invalid 'title' in frontmatter of ${filePath}`);
  }

  if (!DOCUMENT_CATEGORIES.includes(data.category)) {
    throw new Error(
      `Invalid 'category' in ${filePath}: "${data.category}". ` +
        `Must be one of: ${DOCUMENT_CATEGORIES.join(", ")}`
    );
  }

  if (!data.source || typeof data.source !== "string") {
    throw new Error(
      `Missing or invalid 'source' in frontmatter of ${filePath}`
    );
  }

  // ── Optional constrained fields ───────────────────────────────────────
  if (
    data.jurisdiction !== undefined &&
    data.jurisdiction !== null &&
    !JURISDICTIONS.includes(data.jurisdiction as Jurisdiction)
  ) {
    throw new Error(
      `Invalid 'jurisdiction' in ${filePath}: "${data.jurisdiction}". ` +
        `Must be one of: ${JURISDICTIONS.join(", ")}, or null.`
    );
  }

  if (
    data.modality !== undefined &&
    data.modality !== null &&
    !MODALITIES.includes(data.modality as Modality)
  ) {
    throw new Error(
      `Invalid 'modality' in ${filePath}: "${data.modality}". ` +
        `Must be one of: ${MODALITIES.join(", ")}, or null.`
    );
  }

  // ── Tags validation (warn on unrecognised keys, don't fail) ───────────
  const knownTagKeys = ["stage", "competency", "condition"];
  if (data.tags && typeof data.tags === "object") {
    const unknownKeys = Object.keys(data.tags).filter(
      (key) => !knownTagKeys.includes(key)
    );
    if (unknownKeys.length > 0) {
      console.warn(
        `⚠️  Unrecognised tag keys in ${filePath}: ${unknownKeys.join(", ")}. ` +
          `Known keys: ${knownTagKeys.join(", ")}`
      );
    }
  }

  // ── Effective date validation (if present, must be ISO 8601) ──────────
  if (data.effective_date !== undefined && data.effective_date !== null) {
    const parsed = Date.parse(data.effective_date);
    if (Number.isNaN(parsed)) {
      throw new Error(
        `Invalid 'effective_date' in ${filePath}: "${data.effective_date}". ` +
          `Must be an ISO 8601 date string (e.g. "2024-06-01").`
      );
    }
  }

  // ── Assemble (safe to cast — validated above) ─────────────────────────
  const frontmatter: DocumentFrontmatter = {
    title: data.title,
    category: data.category as DocumentCategory,
    jurisdiction: (data.jurisdiction as Jurisdiction) ?? null,
    modality: (data.modality as Modality) ?? null,
    source: data.source,
    version: data.version ?? undefined,
    source_url: data.source_url ?? undefined,
    effective_date: data.effective_date ?? undefined,
    tags: data.tags as DocumentTags | undefined,
  };

  return { frontmatter, content: content.trim() };
}

// ---------------------------------------------------------------------------
// Section path extraction from heading hierarchy
// ---------------------------------------------------------------------------

/**
 * Extract a section path from the markdown heading hierarchy at a given
 * character offset. This populates the `section_path` column for any
 * document that uses markdown headings.
 *
 * Uses the chunk's known character offset (from ChunkMetadata.charStart)
 * rather than searching by content string, which avoids false matches
 * when overlapping chunks share identical text.
 *
 * For a chunk starting at character 500 in a document like:
 *   ## Client Confidentiality
 *   ### When to Break Confidentiality
 *
 * Returns: "Client Confidentiality > When to Break Confidentiality"
 */
function extractSectionPath(
  fullContent: string,
  charStart: number
): string | null {
  if (charStart < 0 || charStart > fullContent.length) {
    return null;
  }

  const textBefore = fullContent.slice(0, charStart);
  const headingRegex = /^(#{1,4})\s+(.+)$/gm;
  const headings: { level: number; text: string }[] = [];

  for (const match of textBefore.matchAll(headingRegex)) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
  }

  if (headings.length === 0) {
    return null;
  }

  // Build the breadcrumb: keep only the most recent heading at each level
  const pathMap = new Map<number, string>();
  for (const heading of headings) {
    pathMap.set(heading.level, heading.text);
    // Clear any deeper levels when we encounter a new heading at this level
    for (const [level] of pathMap) {
      if (level > heading.level) {
        pathMap.delete(level);
      }
    }
  }

  // Sort by level and join
  const sortedEntries = [...pathMap.entries()].sort(([a], [b]) => a - b);
  const path = sortedEntries.map(([, text]) => text).join(" > ");

  return path || null;
}

// ---------------------------------------------------------------------------
// Chunk preparation
// ---------------------------------------------------------------------------

/**
 * Standard (non-parent-child) chunking pipeline.
 */
async function prepareStandardChunks(
  content: string,
  frontmatter: DocumentFrontmatter
): Promise<PreparedChunk[]> {
  const rawChunks: Chunk[] = await chunkDocument(content, frontmatter.category);

  return rawChunks.map((chunk) => ({
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    sectionPath: extractSectionPath(content, chunk.metadata.charStart),
    metadata: { ...chunk.metadata } as Record<string, unknown>,
    isParent: false,
    parentLocalIndex: null,
  }));
}

/**
 * Parent-child chunking pipeline. Returns parent chunks (not embedded)
 * followed by child chunks (embedded, with parent references).
 */
async function prepareParentChildChunks(
  content: string,
  frontmatter: DocumentFrontmatter
): Promise<PreparedChunk[]> {
  const pcChunks: ParentChildChunk[] = await generateParentChildChunks(
    content,
    frontmatter.category
  );

  const { parents, children } = separateParentChildChunks(pcChunks);
  const prepared: PreparedChunk[] = [];

  // Add parent chunks first — they won't be embedded but need DB rows
  // so children can reference them via parent_chunk_id
  for (const parent of parents) {
    const charStart =
      typeof parent.metadata.charStart === "number"
        ? parent.metadata.charStart
        : 0;
    prepared.push({
      content: parent.content,
      chunkIndex: parent.chunkIndex,
      sectionPath: extractSectionPath(content, charStart),
      metadata: parent.metadata,
      isParent: true,
      parentLocalIndex: null,
    });
  }

  // Build a map from original parent chunkIndex to position in prepared array
  const parentIndexMap = new Map<number, number>();
  for (let i = 0; i < parents.length; i++) {
    parentIndexMap.set(parents[i].chunkIndex, i);
  }

  // Add child chunks with references to their parent's local index
  for (const child of children) {
    const parentLocalIdx =
      child.parentIndex !== null
        ? (parentIndexMap.get(pcChunks[child.parentIndex]?.chunkIndex ?? -1) ??
          null)
        : null;

    const childCharStart =
      typeof child.metadata.charStart === "number"
        ? child.metadata.charStart
        : 0;

    prepared.push({
      content: child.content,
      chunkIndex: child.chunkIndex,
      sectionPath: extractSectionPath(content, childCharStart),
      metadata: child.metadata,
      isParent: false,
      parentLocalIndex: parentLocalIdx,
    });
  }

  return prepared;
}

// ---------------------------------------------------------------------------
// Contextual enrichment wrapper
// ---------------------------------------------------------------------------

async function applyContextualEnrichment(
  chunks: PreparedChunk[],
  fullContent: string,
  frontmatter: DocumentFrontmatter
): Promise<PreparedChunk[]> {
  // Only enrich non-parent chunks (parents aren't embedded)
  const toEnrich: PreparedChunk[] = [];
  const parentChunks: PreparedChunk[] = [];

  for (const chunk of chunks) {
    if (chunk.isParent) {
      parentChunks.push(chunk);
    } else {
      toEnrich.push(chunk);
    }
  }

  const inputs: EnrichmentInput[] = toEnrich.map((chunk) => ({
    chunk: chunk.content,
    fullDocument: fullContent,
    documentTitle: frontmatter.title,
    sectionPath: chunk.sectionPath ?? undefined,
  }));

  const enriched = await enrichChunksInBatches(inputs, {
    skipEnrichment: false,
    onBatchComplete: (batchIndex, totalBatches) => {
      console.log(
        `    Enrichment batch ${batchIndex + 1}/${totalBatches} complete`
      );
    },
  });

  // Replace chunk content with enriched content
  const enrichedChunks = toEnrich.map((chunk, i) => ({
    ...chunk,
    content: enriched[i].enrichedContent,
    metadata: {
      ...chunk.metadata,
      contextuallyEnriched: enriched[i].wasEnriched,
    },
  }));

  // Return parents (unchanged) followed by enriched children
  return [...parentChunks, ...enrichedChunks];
}

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

const EMBEDDING_BATCH_SIZE = 100;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

/**
 * Generate embeddings for chunks in batches of 100.
 * Parent chunks get null embeddings (they exist only for context retrieval).
 */
async function generateEmbeddings(
  chunks: PreparedChunk[]
): Promise<(number[] | null)[]> {
  const embeddings: (number[] | null)[] = new Array(chunks.length).fill(null);

  // Collect indices of chunks that need embedding (non-parent chunks)
  const toEmbed: { text: string; originalIndex: number }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i].isParent) {
      toEmbed.push({ text: chunks[i].content, originalIndex: i });
    }
  }

  if (toEmbed.length === 0) {
    return embeddings;
  }

  const totalBatches = Math.ceil(toEmbed.length / EMBEDDING_BATCH_SIZE);
  let totalChars = 0;

  for (let batch = 0; batch < totalBatches; batch++) {
    const start = batch * EMBEDDING_BATCH_SIZE;
    const end = Math.min(start + EMBEDDING_BATCH_SIZE, toEmbed.length);
    const batchItems = toEmbed.slice(start, end);
    const batchTexts = batchItems.map((item) => item.text);

    console.log(
      `    Embedding batch ${batch + 1}/${totalBatches} (${batchTexts.length} chunks)`
    );

    const { embeddings: batchEmbeddings } = await embedMany({
      model: openai.embedding(EMBEDDING_MODEL),
      values: batchTexts,
      providerOptions: {
        openai: { dimensions: EMBEDDING_DIMENSIONS },
      },
    });

    // Map embeddings back to their original positions
    for (let i = 0; i < batchItems.length; i++) {
      embeddings[batchItems[i].originalIndex] = batchEmbeddings[i];
      totalChars += batchItems[i].text.length;
    }
  }

  const estimatedCost = estimateEmbeddingCost(totalChars);
  console.log(
    `    Embedding cost estimate: $${estimatedCost.toFixed(6)} ` +
      `(~${Math.round(totalChars / CHARS_PER_TOKEN_ESTIMATE).toLocaleString()} tokens)`
  );

  return embeddings;
}

// ---------------------------------------------------------------------------
// Supabase operations
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = ReturnType<typeof createClient<any>>;

function createSupabaseClient(): SupabaseAdmin {
  return createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Idempotent upsert: delete existing document with same title, then insert.
 * Cascade delete removes all associated chunks.
 */
async function upsertDocument(
  supabase: SupabaseAdmin,
  frontmatter: DocumentFrontmatter,
  filePath: string,
  chunks: PreparedChunk[],
  embeddings: (number[] | null)[]
): Promise<void> {
  // Check for existing document with same title
  const { data: existing } = await supabase
    .from("knowledge_documents")
    .select("id")
    .eq("title", frontmatter.title)
    .maybeSingle();

  if (existing) {
    console.log(
      `    Replacing existing document: "${frontmatter.title}" (${existing.id})`
    );
    const { error: deleteError } = await supabase
      .from("knowledge_documents")
      .delete()
      .eq("id", existing.id);

    if (deleteError) {
      throw new Error(
        `Failed to delete existing document: ${deleteError.message}`
      );
    }
  }

  // Insert the document row
  const { data: docRow, error: docError } = await supabase
    .from("knowledge_documents")
    .insert({
      title: frontmatter.title,
      category: frontmatter.category,
      source_url: frontmatter.source_url,
      version: frontmatter.version,
      source: frontmatter.source,
      modality: frontmatter.modality,
      jurisdiction: frontmatter.jurisdiction,
      // superseded_by defaults to NULL for new documents
      metadata: {
        tags: frontmatter.tags ?? {},
        source_file: filePath,
      },
    })
    .select("id")
    .single();

  if (docError || !docRow) {
    throw new Error(
      `Failed to insert document: ${docError?.message ?? "No data returned"}`
    );
  }

  const documentId = docRow.id;
  console.log(`    Inserted document: ${documentId}`);

  // --- Insert chunks ---
  // First pass: insert parent chunks (if any) to get their DB IDs
  const parentDbIds = new Map<number, string>(); // localIndex → DB UUID

  const parentChunks = chunks
    .map((chunk, i) => ({ chunk, localIndex: i }))
    .filter(({ chunk }) => chunk.isParent);

  if (parentChunks.length > 0) {
    const parentRows = parentChunks.map(({ chunk }) => ({
      document_id: documentId,
      content: chunk.content,
      embedding: null, // Parents are not embedded
      chunk_index: chunk.chunkIndex,
      modality: frontmatter.modality,
      jurisdiction: frontmatter.jurisdiction,
      document_type: frontmatter.category,
      section_path: chunk.sectionPath,
      metadata: chunk.metadata,
      parent_chunk_id: null,
    }));

    const { data: insertedParents, error: parentError } = await supabase
      .from("knowledge_chunks")
      .insert(parentRows)
      .select("id");

    if (parentError) {
      throw new Error(`Failed to insert parent chunks: ${parentError.message}`);
    }

    // Map local indices to DB IDs
    for (let i = 0; i < parentChunks.length; i++) {
      parentDbIds.set(parentChunks[i].localIndex, insertedParents[i].id);
    }
  }

  // Second pass: insert non-parent chunks with embeddings and parent references
  const childChunks = chunks
    .map((chunk, i) => ({ chunk, localIndex: i }))
    .filter(({ chunk }) => !chunk.isParent);

  if (childChunks.length > 0) {
    // Batch insert in groups to avoid overly large payloads
    const CHUNK_INSERT_BATCH = 50;
    for (let b = 0; b < childChunks.length; b += CHUNK_INSERT_BATCH) {
      const batch = childChunks.slice(b, b + CHUNK_INSERT_BATCH);

      const chunkRows = batch.map(({ chunk, localIndex }) => ({
        document_id: documentId,
        content: chunk.content,
        embedding: embeddings[localIndex]
          ? JSON.stringify(embeddings[localIndex])
          : null,
        chunk_index: chunk.chunkIndex,
        modality: frontmatter.modality,
        jurisdiction: frontmatter.jurisdiction,
        document_type: frontmatter.category,
        section_path: chunk.sectionPath,
        metadata: chunk.metadata,
        parent_chunk_id:
          chunk.parentLocalIndex !== null
            ? (parentDbIds.get(chunk.parentLocalIndex) ?? null)
            : null,
      }));

      const { error: chunkError } = await supabase
        .from("knowledge_chunks")
        .insert(chunkRows);

      if (chunkError) {
        throw new Error(
          `Failed to insert chunks (batch ${Math.floor(b / CHUNK_INSERT_BATCH) + 1}): ${chunkError.message}`
        );
      }
    }
  }

  const parentCount = parentChunks.length;
  const childCount = childChunks.length;
  console.log(
    `    Inserted ${childCount} chunks` +
      (parentCount > 0 ? ` + ${parentCount} parent chunks` : "")
  );
}

// ---------------------------------------------------------------------------
// Process a single file
// ---------------------------------------------------------------------------

async function processFile(
  filePath: string,
  flags: CliFlags,
  supabase: SupabaseAdmin | null
): Promise<{ chunks: number; skipped: boolean }> {
  const raw = readFileSync(filePath, "utf-8");
  const { frontmatter, content } = parseFrontmatter(filePath, raw);

  if (content.length === 0) {
    console.warn(`  ⚠ Skipping empty document: ${frontmatter.title}`);
    return { chunks: 0, skipped: true };
  }

  console.log(`  Title:        ${frontmatter.title}`);
  console.log(`  Category:     ${frontmatter.category}`);
  console.log(`  Jurisdiction: ${frontmatter.jurisdiction ?? "none"}`);
  console.log(`  Modality:     ${frontmatter.modality ?? "none"}`);
  console.log(`  Content:      ${content.length} chars`);

  // Step 1: Chunk the document
  let chunks: PreparedChunk[];
  if (flags.withParents) {
    chunks = await prepareParentChildChunks(content, frontmatter);
    const parents = chunks.filter((c) => c.isParent).length;
    const children = chunks.filter((c) => !c.isParent).length;
    console.log(
      `  Chunks:       ${children} children + ${parents} parents (parent-child mode)`
    );
  } else {
    chunks = await prepareStandardChunks(content, frontmatter);
    console.log(`  Chunks:       ${chunks.length}`);
  }

  // Step 2: Optional contextual enrichment
  if (flags.withContext) {
    console.log("  Applying contextual enrichment...");
    chunks = await applyContextualEnrichment(chunks, content, frontmatter);
  }

  // Dry run stops here
  if (flags.dryRun) {
    console.log("  [dry-run] Skipping embedding and database insertion");
    return { chunks: chunks.filter((c) => !c.isParent).length, skipped: false };
  }

  // Step 3: Generate embeddings
  console.log("  Generating embeddings...");
  const embeddings = await generateEmbeddings(chunks);

  // Step 4: Upsert into Supabase
  // supabase is non-null here: dry-run returns early above, and the client is
  // only null when flags.dryRun is true (see main()).
  if (!supabase) {
    throw new Error("Supabase client not initialized");
  }
  console.log("  Inserting into Supabase...");
  await upsertDocument(supabase, frontmatter, filePath, chunks, embeddings);

  return { chunks: chunks.filter((c) => !c.isParent).length, skipped: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const flags = parseFlags();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Knowledge Base Ingestion Pipeline      ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`Directory:     ${flags.dir}`);
  console.log(`Dry run:       ${flags.dryRun}`);
  console.log(`With context:  ${flags.withContext}`);
  console.log(`With parents:  ${flags.withParents}`);
  console.log();

  // Validate environment (skip for dry-run if we only need to parse)
  if (!flags.dryRun) {
    validateEnv();
  } else if (!OPENAI_API_KEY && flags.withContext) {
    validateEnv();
  }

  // Discover files
  const files = findMarkdownFiles(flags.dir);
  if (files.length === 0) {
    console.error(`No .md files found in ${flags.dir}`);
    process.exit(1);
  }
  console.log(`Found ${files.length} markdown file(s):\n`);

  // Create Supabase client (only if not dry-run)
  const supabase = flags.dryRun ? null : createSupabaseClient();

  // Process each file
  let totalChunks = 0;
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const relPath = relative(process.cwd(), filePath);

    console.log(`─── [${i + 1}/${files.length}] ${relPath} ───`);

    try {
      const result = await processFile(filePath, flags, supabase);
      if (result.skipped) {
        skipCount++;
      } else {
        successCount++;
        totalChunks += result.chunks;
      }
    } catch (error) {
      failCount++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR: ${message}`);
      if (error instanceof Error && error.stack) {
        console.error(
          `    ${error.stack.split("\n").slice(1, 3).join("\n    ")}`
        );
      }
    }

    console.log();
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("═══════════════════════════════════════════");
  console.log("  Ingestion Complete");
  console.log("═══════════════════════════════════════════");
  console.log(`  Files processed: ${successCount}`);
  console.log(`  Files skipped:   ${skipCount}`);
  console.log(`  Files failed:    ${failCount}`);
  console.log(`  Total chunks:    ${totalChunks}`);
  console.log(`  Time elapsed:    ${elapsed}s`);
  if (flags.dryRun) {
    console.log("  Mode:            DRY RUN (no DB writes)");
  }
  console.log("═══════════════════════════════════════════");

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
