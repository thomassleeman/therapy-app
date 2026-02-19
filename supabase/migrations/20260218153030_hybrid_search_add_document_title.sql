-- =============================================================================
-- Amendment: Add document_title to hybrid_search RPC response
-- =============================================================================
-- File: supabase/migrations/YYYYMMDDHHMMSS_hybrid_search_add_document_title.sql
--
-- WHY THIS CHANGE:
-- The original hybrid_search function returns columns only from knowledge_chunks.
-- The searchKnowledgeBase tool needs the document title for citations, but
-- document_title lives on knowledge_documents. Rather than making a second
-- round-trip query in the application layer, we JOIN inside the RPC — this is
-- a single round-trip, the knowledge_documents table is small, and every
-- search result needs the title for citation purposes.
--
-- HOW TO APPLY:
-- If you haven't deployed the original hybrid_search yet, fold this change
-- directly into your existing migration (Task 1.5). If you have, run this
-- as a new migration — CREATE OR REPLACE is safe on existing functions.
-- =============================================================================

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
  modality TEXT,
  jurisdiction TEXT,
  document_type TEXT,
  metadata JSONB,
  similarity_score FLOAT,
  combined_rrf_score FLOAT,
  -- NEW: joined from knowledge_documents
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
      AND (filter_modality IS NULL OR kc.modality = filter_modality)
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
      AND (filter_modality IS NULL OR kc.modality = filter_modality)
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