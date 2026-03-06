-- =============================================================================
-- Migration: Add mct and act to valid modalities
-- =============================================================================
-- Extends the modality enum to include Metacognitive Therapy (mct) and
-- Acceptance and Commitment Therapy (act), matching the updated
-- MODALITIES array in lib/types/knowledge.ts.
-- =============================================================================

-- 1. Update the validation function used by CHECK constraints on
--    knowledge_documents and knowledge_chunks
CREATE OR REPLACE FUNCTION public.validate_modality_array(arr TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT bool_and(elem IN ('cbt', 'person_centred', 'psychodynamic', 'mct', 'act'))
  FROM unnest(arr) AS elem;
$$;

-- 2. Update therapist_profiles.default_modality CHECK constraint (if it exists)
--    This is a single TEXT column, not an array.
ALTER TABLE public.therapist_profiles
  DROP CONSTRAINT IF EXISTS therapist_profiles_default_modality_check;

ALTER TABLE public.therapist_profiles
  ADD CONSTRAINT therapist_profiles_default_modality_check
  CHECK (default_modality IS NULL OR default_modality IN ('cbt', 'person_centred', 'psychodynamic', 'mct', 'act'));