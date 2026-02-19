-- =============================================================================
-- Migration: Add RAG knowledge base tables
-- =============================================================================
-- Sets up the core tables, indexes, search function, and RLS policies for the
-- therapy reflection RAG system. The knowledge base is a shared clinical
-- reference library: all authenticated therapists can read; only the
-- service_role (ingestion pipeline) can write.
--
-- Dependency order:
--   1. pgvector extension
--   2. knowledge_documents table
--   3. knowledge_chunks table
--   4. Indexes (B-tree, GIN, HNSW full + partial)
--   5. hybrid_search RPC function
--   6. RLS policies
-- =============================================================================


-- ============================================================================
-- 1. Extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


-- ============================================================================
-- 2. knowledge_documents table
-- ============================================================================
-- category controls which chunking strategy is applied during ingestion:
--   'legislation'          → hierarchical chunking (preserving section/subsection structure)
--   'guideline'            → section-aware chunking (respecting heading boundaries)
--   'therapeutic_content'  → semantic chunking (based on meaning/topic shifts)
--
-- modality controls retrieval filtering at query time, ensuring responses
-- are scoped to the therapist's relevant framework (e.g. 'cbt'). NULL for
-- legislation and guidelines that apply across all modalities.
--
-- jurisdiction enables filtering legislation and guidelines by the
-- therapist's jurisdiction (UK vs Ireland).
--
-- superseded_by creates a document lineage chain — when legislation is
-- amended, the old document points to its replacement. Search excludes
-- documents where superseded_by IS NOT NULL.

CREATE TABLE knowledge_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  category        TEXT        NOT NULL CHECK (category IN ('legislation', 'guideline', 'therapeutic_content')),
  source_url      TEXT,
  version         TEXT,
  source          TEXT        NOT NULL,
  modality        TEXT,
  jurisdiction    TEXT        CHECK (jurisdiction IN ('UK', 'EU')) DEFAULT NULL,
  superseded_by   UUID        REFERENCES knowledge_documents(id) DEFAULT NULL,
  metadata        JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- 3. knowledge_chunks table
-- ============================================================================
-- Stores embedded text chunks for hybrid search (vector similarity + keyword)
-- in the therapy reflection RAG system.

CREATE TABLE knowledge_chunks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  content         TEXT        NOT NULL,
  embedding       VECTOR(512),
  chunk_index     INTEGER     NOT NULL,
  modality        TEXT,
  jurisdiction    TEXT        CHECK (jurisdiction IN ('UK', 'EU')),
  document_type   TEXT        NOT NULL CHECK (document_type IN ('legislation', 'guideline', 'therapeutic_content')),
  section_path    TEXT,
  metadata        JSONB       DEFAULT '{}',
  parent_chunk_id UUID        REFERENCES knowledge_chunks(id),
  fts             TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- 4. Indexes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 4a. Full HNSW index for approximate nearest-neighbour vector search
-- ---------------------------------------------------------------------------
--   • m = 16: each node maintains 16 bi-directional links. Higher values
--     improve recall at the cost of memory and index-build time. 16 is a
--     well-tested default that balances recall (~95%+) with resource usage.
--   • ef_construction = 128: the size of the dynamic candidate list during
--     index construction. Larger values produce a higher-quality graph
--     (better recall) but slow down inserts. 128 is a strong choice for a
--     knowledge base that is written infrequently and read often.
--   Note: query-time recall is controlled separately by hnsw.ef_search.

CREATE INDEX idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- ---------------------------------------------------------------------------
-- 4b. GIN index on the generated tsvector column for full-text keyword search
-- ---------------------------------------------------------------------------

CREATE INDEX idx_knowledge_chunks_fts
  ON knowledge_chunks
  USING gin (fts);

-- ---------------------------------------------------------------------------
-- 4c. B-tree indexes on denormalised filter columns
-- ---------------------------------------------------------------------------
-- These columns are promoted from knowledge_documents so that query-time
-- filtering can happen directly on knowledge_chunks without an expensive
-- JOIN back to the parent table. In a hybrid search query the planner can
-- apply these cheap B-tree filters BEFORE the more expensive vector
-- similarity scan, dramatically reducing the candidate set.

CREATE INDEX idx_knowledge_chunks_modality
  ON knowledge_chunks (modality);

CREATE INDEX idx_knowledge_chunks_document_type
  ON knowledge_chunks (document_type);

CREATE INDEX idx_knowledge_chunks_jurisdiction
  ON knowledge_chunks (jurisdiction);

-- ---------------------------------------------------------------------------
-- 4d. GIN index on JSONB metadata for flexible ad-hoc queries
-- ---------------------------------------------------------------------------

CREATE INDEX idx_knowledge_chunks_metadata
  ON knowledge_chunks
  USING gin (metadata);

-- ---------------------------------------------------------------------------
-- 4e. Partial HNSW indexes per therapeutic modality
-- ---------------------------------------------------------------------------
-- These create separate, smaller vector indexes scoped to specific modality
-- and document_type values. When a query includes a WHERE clause matching
-- one of these partitions (e.g. WHERE modality = 'cbt'), PostgreSQL uses the
-- smaller partial index instead of scanning a single large HNSW graph.
--
-- This avoids the "connectivity problem" where post-filtering a full HNSW
-- index can miss relevant results — each partial index is a complete graph
-- over its own subset of data.
--
-- To add a new modality, create another index following the same pattern:
--   CREATE INDEX idx_chunks_hnsw_<modality> ON knowledge_chunks
--     USING hnsw (embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 128)
--     WHERE modality = '<modality>';
--
-- NOTE: On pgvector 0.8.0+ (supported by Supabase), iterative scan mode
-- provides an alternative approach. It automatically rescans the HNSW index
-- when filtered results are insufficient, which may reduce the need for
-- per-value partial indexes as the number of modalities grows.

CREATE INDEX idx_chunks_hnsw_cbt
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE modality = 'cbt';

CREATE INDEX idx_chunks_hnsw_person_centred
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE modality = 'person_centred';

CREATE INDEX idx_chunks_hnsw_psychodynamic
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE modality = 'psychodynamic';

-- ---------------------------------------------------------------------------
-- 4f. Partial HNSW indexes per document type
-- ---------------------------------------------------------------------------

CREATE INDEX idx_chunks_hnsw_legislation
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE document_type = 'legislation';

CREATE INDEX idx_chunks_hnsw_guideline
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE document_type = 'guideline';

CREATE INDEX idx_chunks_hnsw_therapeutic_content
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128)
  WHERE document_type = 'therapeutic_content';


-- ============================================================================
-- 5. hybrid_search RPC function
-- ============================================================================
-- Combines vector similarity search with full-text keyword search using
-- Reciprocal Rank Fusion (RRF). RRF merges ranked lists from multiple search
-- methods by scoring each result as weight / (k + rank), where k is a
-- smoothing constant. Results ranked highly by BOTH methods rise to the top.
-- RRF works with ranks rather than raw scores, avoiding the calibration
-- problem where cosine distances and ts_rank scores sit on incomparable scales.
--
-- Weight tuning guide:
--   - Legislation queries (exact legal terms matter): full_text_weight = 2.0
--   - Conceptual therapeutic queries: keep weights balanced (1.0 / 1.0)
--   - Semantic-heavy queries (e.g. "how do I handle ruptures"): semantic_weight = 1.5

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
  combined_rrf_score FLOAT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Over-fetch factor: retrieve more candidates than needed for better fusion quality.
  -- Each CTE fetches match_count * 4 rows so that the RRF merge has a rich pool
  -- from both search methods before trimming to the final match_count.
  candidate_count INT := match_count * 4;

  -- Default rank assigned when a chunk appears in only one search method.
  -- Must be higher than any real rank to avoid inflating the RRF score
  -- for the missing side.
  default_rank INT := match_count * 4 + 1;
BEGIN
  RETURN QUERY

  WITH full_text AS (
    -- Full-text keyword search using PostgreSQL tsvector/tsquery.
    -- plainto_tsquery handles natural language input without requiring
    -- boolean operators from the user. ts_rank_cd uses cover density
    -- ranking which rewards proximity of matching terms.
    SELECT
      kc.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(kc.fts, plainto_tsquery('english', hybrid_search.query_text)) DESC
      ) AS rank
    FROM public.knowledge_chunks kc
    INNER JOIN public.knowledge_documents kd ON kd.id = kc.document_id
    WHERE
      kc.fts @@ plainto_tsquery('english', hybrid_search.query_text)
      -- Exclude superseded documents so outdated legislation is never retrieved
      AND kd.superseded_by IS NULL
      -- Optional metadata filters — NULL means no filter applied
      AND (hybrid_search.filter_category IS NULL OR kc.document_type = hybrid_search.filter_category)
      AND (hybrid_search.filter_modality IS NULL OR kc.modality = hybrid_search.filter_modality)
      AND (hybrid_search.filter_jurisdiction IS NULL OR kc.jurisdiction = hybrid_search.filter_jurisdiction)
    ORDER BY ts_rank_cd(kc.fts, plainto_tsquery('english', hybrid_search.query_text)) DESC
    LIMIT candidate_count
  ),

  semantic AS (
    -- Vector similarity search using pgvector's cosine distance operator.
    -- The <=> operator returns cosine distance (0 = identical, 2 = opposite),
    -- so we ORDER ASC for closest matches. We convert distance to a 0-1
    -- similarity score for downstream confidence thresholds.
    SELECT
      kc.id,
      (1 - (kc.embedding OPERATOR(extensions.<=>) hybrid_search.query_embedding)) AS similarity,
      ROW_NUMBER() OVER (
        ORDER BY kc.embedding OPERATOR(extensions.<=>) hybrid_search.query_embedding ASC
      ) AS rank
    FROM public.knowledge_chunks kc
    INNER JOIN public.knowledge_documents kd ON kd.id = kc.document_id
    WHERE
      -- Exclude superseded documents
      kd.superseded_by IS NULL
      -- Same optional filters as full-text CTE to keep candidate pools aligned
      AND (hybrid_search.filter_category IS NULL OR kc.document_type = hybrid_search.filter_category)
      AND (hybrid_search.filter_modality IS NULL OR kc.modality = hybrid_search.filter_modality)
      AND (hybrid_search.filter_jurisdiction IS NULL OR kc.jurisdiction = hybrid_search.filter_jurisdiction)
    ORDER BY kc.embedding OPERATOR(extensions.<=>) hybrid_search.query_embedding ASC
    LIMIT candidate_count
  )

  -- Reciprocal Rank Fusion: merge the two ranked lists.
  -- FULL OUTER JOIN ensures chunks found by only one method are still considered.
  SELECT
    COALESCE(s.id, ft.id) AS id,
    kc.content,
    kc.document_id,
    kc.section_path,
    kc.modality,
    kc.jurisdiction,
    kc.document_type,
    kc.metadata,
    COALESCE(s.similarity, 0.0)::FLOAT AS similarity_score,
    (
      -- RRF formula: sum of weighted reciprocal ranks from each method.
      -- When a chunk appears in only one CTE, we assign default_rank (candidate_count + 1)
      -- for the missing side. This gives a small but non-zero contribution rather than
      -- ignoring the missing method entirely — the chunk is treated as if it ranked just
      -- outside the candidate pool.
      --
      -- Example with default weights and k=60:
      --   Ranked #1 in both:    1/(60+1) + 1/(60+1)  ≈ 0.0328
      --   Ranked #1 semantic only: 1/(60+1) + 1/(60+21) ≈ 0.0288
      (hybrid_search.semantic_weight / (hybrid_search.rrf_k + COALESCE(s.rank, default_rank)))
      +
      (hybrid_search.full_text_weight / (hybrid_search.rrf_k + COALESCE(ft.rank, default_rank)))
    )::FLOAT AS combined_rrf_score

  FROM semantic s
  FULL OUTER JOIN full_text ft ON s.id = ft.id
  -- Join back to the chunks table to retrieve full content and metadata
  INNER JOIN public.knowledge_chunks kc ON kc.id = COALESCE(s.id, ft.id)

  ORDER BY combined_rrf_score DESC
  LIMIT hybrid_search.match_count;
END;
$$;

-- Grant execute permission to authenticated users (knowledge base is a shared
-- clinical reference library readable by all therapists via RLS).
GRANT EXECUTE ON FUNCTION public.hybrid_search TO authenticated;

COMMENT ON FUNCTION public.hybrid_search IS
  'Hybrid search combining pgvector cosine similarity with PostgreSQL full-text '
  'search via Reciprocal Rank Fusion (RRF). Filters by document_type, modality, '
  'and jurisdiction to prevent content bleeding (e.g. UK legislation shown to '
  'Irish therapists, or CBT content during person-centred reflection). '
  'Automatically excludes superseded documents.';


-- ============================================================================
-- 6. Row Level Security policies
-- ============================================================================
-- The knowledge base is a shared clinical reference library.
-- All authenticated users (therapists) can read from both tables.
-- Only service_role (used by the ingestion script) can write.
-- Idempotent: drops existing policies before recreating.

-- Enable RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks    ENABLE ROW LEVEL SECURITY;

-- knowledge_documents policies
DROP POLICY IF EXISTS "Authenticated users can read knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Authenticated users can read knowledge documents"
  ON public.knowledge_documents
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role can insert knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Service role can insert knowledge documents"
  ON public.knowledge_documents
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can update knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Service role can update knowledge documents"
  ON public.knowledge_documents
  FOR UPDATE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can delete knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Service role can delete knowledge documents"
  ON public.knowledge_documents
  FOR DELETE
  USING (auth.role() = 'service_role');

-- knowledge_chunks policies
DROP POLICY IF EXISTS "Authenticated users can read knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Authenticated users can read knowledge chunks"
  ON public.knowledge_chunks
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role can insert knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Service role can insert knowledge chunks"
  ON public.knowledge_chunks
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can update knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Service role can update knowledge chunks"
  ON public.knowledge_chunks
  FOR UPDATE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can delete knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Service role can delete knowledge chunks"
  ON public.knowledge_chunks
  FOR DELETE
  USING (auth.role() = 'service_role');