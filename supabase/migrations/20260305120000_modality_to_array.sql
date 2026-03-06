-- =============================================================================
-- Migration: Convert modality from TEXT to TEXT[]
-- =============================================================================
-- WHY THIS CHANGE:
-- Documents in the therapy knowledge base can belong to multiple therapeutic
-- modalities. For example, a document comparing CBT and person-centred
-- approaches, or a cross-modality guideline on therapeutic alliance, should
-- be tagged with all relevant modalities rather than being forced into one.
--
-- Converting modality from TEXT to TEXT[] on knowledge_documents and
-- knowledge_chunks enables multi-modality tagging at the document level while
-- keeping query-time filtering simple (callers still pass a single modality
-- and we use ANY() to match against the array).
--
-- NULL continues to mean "applies to all modalities" (e.g. legislation,
-- cross-cutting guidelines). This is distinct from an empty array, which
-- we do not use.
--
-- WHAT CHANGES:
--   1. Helper function validate_modality_array() for CHECK constraints
--   2. Drop indexes that reference modality as TEXT (before type change)
--   3. knowledge_documents.modality: TEXT → TEXT[]
--   4. knowledge_chunks.modality: TEXT → TEXT[]
--   5. Create GIN index on knowledge_chunks.modality for array queries
--   6. Recreate hybrid_search RPC with updated modality filter logic
--   7. Add clarifying comment on therapist_profiles.default_modality
-- =============================================================================


-- ============================================================================
-- 1. Helper function for modality array validation
-- ============================================================================
-- Validates that every element in a TEXT[] is a recognised therapeutic modality.
-- Used in CHECK constraints on knowledge_documents and knowledge_chunks.
-- STRICT means the function returns NULL (not TRUE) for NULL input, which is
-- what we want — NULL modality should bypass the CHECK via IS NULL guard.

CREATE OR REPLACE FUNCTION public.validate_modality_array(arr TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT bool_and(elem IN ('cbt', 'person_centred', 'psychodynamic'))
  FROM unnest(arr) AS elem;
$$;


-- ============================================================================
-- 2. Drop indexes that reference modality as TEXT
-- ============================================================================
-- Must happen BEFORE the ALTER COLUMN TYPE below. The partial HNSW indexes
-- have WHERE modality = 'cbt' predicates that PostgreSQL validates during
-- the type change — dropping them first avoids a type mismatch error.

DROP INDEX IF EXISTS idx_chunks_hnsw_cbt;
DROP INDEX IF EXISTS idx_chunks_hnsw_person_centred;
DROP INDEX IF EXISTS idx_chunks_hnsw_psychodynamic;
DROP INDEX IF EXISTS idx_chunks_modality;
DROP INDEX IF EXISTS idx_knowledge_chunks_modality;


-- ============================================================================
-- 3. Convert knowledge_documents.modality from TEXT to TEXT[]
-- ============================================================================
-- Existing single values become single-element arrays.
-- NULL values remain NULL (meaning "applies to all modalities").

ALTER TABLE public.knowledge_documents
  ALTER COLUMN modality TYPE TEXT[]
  USING CASE WHEN modality IS NOT NULL THEN ARRAY[modality] ELSE NULL END;

ALTER TABLE public.knowledge_documents
  ADD CONSTRAINT knowledge_documents_modality_check
  CHECK (modality IS NULL OR validate_modality_array(modality));


-- ============================================================================
-- 4. Convert knowledge_chunks.modality from TEXT to TEXT[]
-- ============================================================================

ALTER TABLE public.knowledge_chunks
  ALTER COLUMN modality TYPE TEXT[]
  USING CASE WHEN modality IS NOT NULL THEN ARRAY[modality] ELSE NULL END;

ALTER TABLE public.knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_modality_check
  CHECK (modality IS NULL OR validate_modality_array(modality));


-- ============================================================================
-- 5. Create GIN index for array containment queries
-- ============================================================================
-- GIN indexes support the @> and && array operators, enabling efficient
-- queries like: WHERE modality @> ARRAY['cbt'] (contains) or
-- WHERE modality && ARRAY['cbt','psychodynamic'] (overlaps).

CREATE INDEX idx_chunks_modality_gin
  ON public.knowledge_chunks USING gin (modality);


-- ============================================================================
-- 6. Recreate hybrid_search RPC with updated modality filter
-- ============================================================================
-- Changes from previous version (20260218153030_hybrid_search_add_document_title):
--   - Return type: modality column is now TEXT[] (was TEXT)
--   - WHERE clause: filter_modality = ANY(kc.modality) (was kc.modality = filter_modality)
--   - filter_modality parameter stays TEXT — callers still pass a single modality
--
-- The full function is reproduced here. Because the return type changed
-- (modality TEXT → TEXT[]), CREATE OR REPLACE alone is insufficient —
-- PostgreSQL requires DROP FUNCTION first when OUT parameter types change.

DROP FUNCTION IF EXISTS public.hybrid_search(TEXT, VECTOR(512), INT, TEXT, TEXT, TEXT, FLOAT, FLOAT, INT);

CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(512),
  match_count INT DEFAULT 5,
  filter_category TEXT DEFAULT NULL,
  filter_modality TEXT DEFAULT NULL,
  filter_jurisdiction TEXT DEFAULT NULL,
  full_text_weight FLOAT DEFAULT 1.0,
  semantic_weight FLOAT DEFAULT 1.0,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  document_id UUID,
  section_path TEXT,
  modality TEXT[],
  jurisdiction TEXT,
  document_type TEXT,
  metadata JSONB,
  similarity_score FLOAT,
  combined_rrf_score FLOAT,
  document_title TEXT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Set HNSW query-time recall parameter. Higher = more accurate but slower.
  -- 100 is appropriate for 10,000–50,000 chunks. SET LOCAL scopes this to
  -- the current transaction only, which is required on Supabase's managed
  -- Postgres (ALTER DATABASE is not permitted for extension parameters).
  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY

  -- =========================================================================
  -- Reciprocal Rank Fusion (RRF) combines two ranked result lists by
  -- assigning each result a score of 1/(k + rank). Documents ranked highly
  -- by BOTH methods rise to the top. RRF works with ranks rather than raw
  -- scores, avoiding the calibration problem where cosine distances and
  -- BM25/ts_rank scores are on incomparable scales.
  --
  -- TUNING: For legislation queries where exact legal terms matter, pass
  -- full_text_weight = 2.0. For conceptual therapeutic queries, keep weights
  -- balanced (1.0/1.0) or slightly favour semantic_weight.
  -- =========================================================================

  WITH semantic AS (
    -- Semantic search: pgvector cosine distance
    SELECT
      kc.id,
      kc.content,
      kc.document_id,
      kc.section_path,
      kc.modality,
      kc.jurisdiction,
      kc.document_type,
      kc.metadata,
      -- Cosine similarity = 1 - cosine distance. Exposed for confidence thresholds.
      1 - (kc.embedding <=> query_embedding) AS similarity_score,
      ROW_NUMBER() OVER (ORDER BY kc.embedding <=> query_embedding) AS rank
    FROM public.knowledge_chunks kc
    WHERE
      -- Exclude chunks from superseded documents
      kc.document_id NOT IN (
        SELECT kd.id FROM public.knowledge_documents kd
        WHERE kd.superseded_by IS NOT NULL
      )
      AND (filter_category IS NULL OR kc.document_type = filter_category)
      AND (filter_modality IS NULL OR filter_modality = ANY(kc.modality))
      AND (filter_jurisdiction IS NULL OR kc.jurisdiction = filter_jurisdiction)
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count * 4  -- Over-fetch for better fusion
  ),

  full_text AS (
    -- Full-text search: tsvector + ts_rank_cd
    SELECT
      kc.id,
      kc.content,
      kc.document_id,
      kc.section_path,
      kc.modality,
      kc.jurisdiction,
      kc.document_type,
      kc.metadata,
      ts_rank_cd(kc.fts, plainto_tsquery('english', query_text)) AS text_rank,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(kc.fts, plainto_tsquery('english', query_text)) DESC
      ) AS rank
    FROM public.knowledge_chunks kc
    WHERE
      kc.fts @@ plainto_tsquery('english', query_text)
      AND kc.document_id NOT IN (
        SELECT kd.id FROM public.knowledge_documents kd
        WHERE kd.superseded_by IS NOT NULL
      )
      AND (filter_category IS NULL OR kc.document_type = filter_category)
      AND (filter_modality IS NULL OR filter_modality = ANY(kc.modality))
      AND (filter_jurisdiction IS NULL OR kc.jurisdiction = filter_jurisdiction)
    ORDER BY text_rank DESC
    LIMIT match_count * 4  -- Over-fetch for better fusion
  ),

  fused AS (
    -- Merge with RRF. For chunks appearing in only one CTE, use a high
    -- default rank so they aren't unfairly penalised but also don't
    -- dominate over chunks found by both methods.
    SELECT
      COALESCE(s.id, ft.id) AS id,
      COALESCE(s.content, ft.content) AS content,
      COALESCE(s.document_id, ft.document_id) AS document_id,
      COALESCE(s.section_path, ft.section_path) AS section_path,
      COALESCE(s.modality, ft.modality) AS modality,
      COALESCE(s.jurisdiction, ft.jurisdiction) AS jurisdiction,
      COALESCE(s.document_type, ft.document_type) AS document_type,
      COALESCE(s.metadata, ft.metadata) AS metadata,
      s.similarity_score,
      -- RRF formula: weight / (k + rank)
      (
        semantic_weight / (rrf_k + COALESCE(s.rank, match_count * 4 + 1))
        + full_text_weight / (rrf_k + COALESCE(ft.rank, match_count * 4 + 1))
      ) AS combined_rrf_score
    FROM semantic s
    FULL OUTER JOIN full_text ft ON s.id = ft.id
  )

  -- Final SELECT joins knowledge_documents to get the document title
  SELECT
    f.id,
    f.content,
    f.document_id,
    f.section_path,
    f.modality,
    f.jurisdiction,
    f.document_type,
    f.metadata,
    f.similarity_score::FLOAT,
    f.combined_rrf_score::FLOAT,
    kd.title AS document_title
  FROM fused f
  INNER JOIN public.knowledge_documents kd ON kd.id = f.document_id
  ORDER BY f.combined_rrf_score DESC
  LIMIT match_count;

END;
$$;

-- Grant execute to authenticated users only (matches existing RLS policy)
REVOKE ALL ON FUNCTION public.hybrid_search FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_search TO authenticated;

COMMENT ON FUNCTION public.hybrid_search IS
  'Hybrid search combining pgvector cosine similarity with PostgreSQL full-text '
  'search via Reciprocal Rank Fusion (RRF). Filters by document_type, modality, '
  'and jurisdiction. modality is now TEXT[] — filter_modality (single TEXT) matches '
  'any element in the array via ANY(). Supported categories: legislation, guideline, '
  'therapeutic_content, clinical_practice. Automatically excludes superseded documents.';


-- ============================================================================
-- 7. Clarify therapist_profiles.default_modality stays as TEXT
-- ============================================================================
-- This column is a query-time filter preference, not a document attribute.
-- It remains a single TEXT value — therapists pick one default modality to
-- filter search results by, even though documents may belong to multiple.

COMMENT ON COLUMN public.therapist_profiles.default_modality IS
  'Therapist''s default modality filter for search. Single value — this controls '
  'query-time filtering, not document tagging. Documents may belong to multiple '
  'modalities via TEXT[] on knowledge_documents/knowledge_chunks.';
