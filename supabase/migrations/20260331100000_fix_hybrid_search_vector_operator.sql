-- Fix: schema-qualify the pgvector <=> operator so it works with SET search_path = ''
-- Error was: "operator does not exist: extensions.vector <=> extensions.vector"
-- because pgvector is installed in the 'extensions' schema on Supabase.

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
  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY

  WITH semantic AS (
    SELECT
      kc.id,
      kc.content,
      kc.document_id,
      kc.section_path,
      kc.modality,
      kc.jurisdiction,
      kc.document_type,
      kc.metadata,
      1 - (kc.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity_score,
      ROW_NUMBER() OVER (ORDER BY kc.embedding OPERATOR(extensions.<=>) query_embedding) AS rank
    FROM public.knowledge_chunks kc
    WHERE
      kc.document_id NOT IN (
        SELECT kd.id FROM public.knowledge_documents kd
        WHERE kd.superseded_by IS NOT NULL
      )
      AND (filter_category IS NULL OR kc.document_type = filter_category)
      AND (filter_modality IS NULL OR filter_modality = ANY(kc.modality))
      AND (filter_jurisdiction IS NULL OR kc.jurisdiction = filter_jurisdiction)
    ORDER BY kc.embedding OPERATOR(extensions.<=>) query_embedding
    LIMIT match_count * 4
  ),

  full_text AS (
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
    LIMIT match_count * 4
  ),

  fused AS (
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
      (
        semantic_weight / (rrf_k + COALESCE(s.rank, match_count * 4 + 1))
        + full_text_weight / (rrf_k + COALESCE(ft.rank, match_count * 4 + 1))
      ) AS combined_rrf_score
    FROM semantic s
    FULL OUTER JOIN full_text ft ON s.id = ft.id
  )

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
