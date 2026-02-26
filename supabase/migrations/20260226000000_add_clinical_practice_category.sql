-- =============================================================================
-- Migration: Add clinical_practice content category
-- =============================================================================
-- Extends the knowledge base to support a fourth content category for
-- cross-modality professional practice guidance (note-taking, record
-- management, treatment planning, documentation standards).
--
-- The hybrid_search RPC does NOT need changes — it uses filter_category
-- as a plain TEXT parameter, not a CHECK-constrained column.
-- =============================================================================

-- 1. Update CHECK constraint on knowledge_documents.category
ALTER TABLE public.knowledge_documents
  DROP CONSTRAINT IF EXISTS knowledge_documents_category_check;

ALTER TABLE public.knowledge_documents
  ADD CONSTRAINT knowledge_documents_category_check
  CHECK (category IN ('legislation', 'guideline', 'therapeutic_content', 'clinical_practice'));

-- 2. Update CHECK constraint on knowledge_chunks.document_type
ALTER TABLE public.knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_document_type_check;

ALTER TABLE public.knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_document_type_check
  CHECK (document_type IN ('legislation', 'guideline', 'therapeutic_content', 'clinical_practice'));

-- 3. Add partial HNSW index for the new category
--    Follows the same pattern as existing per-category indexes
--    (idx_chunks_hnsw_legislation, idx_chunks_hnsw_guideline, etc.)
CREATE INDEX IF NOT EXISTS idx_chunks_hnsw_clinical_practice
  ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE document_type = 'clinical_practice';

-- 4. Update the hybrid_search function comment (informational only)
COMMENT ON FUNCTION public.hybrid_search IS
  'Hybrid search combining pgvector cosine similarity with PostgreSQL full-text '
  'search via Reciprocal Rank Fusion (RRF). Filters by document_type, modality, '
  'and jurisdiction to prevent content bleeding. Supported categories: '
  'legislation, guideline, therapeutic_content, clinical_practice. '
  'Automatically excludes superseded documents.';
