// lib/types/knowledge.ts

// ── Shared enums ──────────────────────────────────────────────────────────
// Single source of truth consumed by ingestion script, search tools, and UI.

export const DOCUMENT_CATEGORIES = [
  "legislation",
  "guideline",
  "therapeutic_content",
] as const;

export const JURISDICTIONS = ["UK", "EU"] as const;

export const MODALITIES = ["cbt", "person_centred", "psychodynamic"] as const;

export const THERAPY_STAGES = [
  "assessment",
  "formulation",
  "intervention",
  "maintenance",
  "endings",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export type Jurisdiction = (typeof JURISDICTIONS)[number];
export type Modality = (typeof MODALITIES)[number];
export type TherapyStage = (typeof THERAPY_STAGES)[number];

// ── Tags ──────────────────────────────────────────────────────────────────

export interface DocumentTags {
  /** Therapeutic stage this content relates to. */
  stage?: TherapyStage | TherapyStage[];
  /** Competency area (e.g. "therapeutic techniques", "ethical practice"). */
  competency?: string;
  /** Clinical condition (e.g. "anxiety", "depression", "trauma"). */
  condition?: string | string[];
}

// ── Frontmatter ───────────────────────────────────────────────────────────

export interface DocumentFrontmatter {
  /** Human-readable document title. Must be unique across the knowledge base. */
  title: string;
  /** Controls chunking strategy and retrieval filtering. */
  category: DocumentCategory;
  /** Legal jurisdiction. Required for legislation/guidelines, null for therapeutic content. */
  jurisdiction: Jurisdiction | null;
  /** Therapeutic modality. Required for therapeutic_content, null for cross-modality docs. */
  modality: Modality | null;
  /** Provenance — who authored or where it came from. */
  source: string;
  /** Semantic version string for tracking document revisions. */
  version?: string;
  /** URL to the original/canonical source, if applicable. */
  source_url?: string;
  /** Optional date the content was authored or became effective (ISO 8601). */
  effective_date?: string;
  /** Structured tags for fine-grained filtering. */
  tags?: DocumentTags;
}
