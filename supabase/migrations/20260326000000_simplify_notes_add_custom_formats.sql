-- Migration: Simplify clinical notes to single-body format + add custom note formats
--
-- Part 1: Flatten existing structured note content into { "body": "..." }
-- Part 2: Create custom_note_formats table
-- Part 3: Enable RLS on custom_note_formats
-- Part 4: Add updated_at trigger
-- Part 5: Relax note_format CHECK constraint to allow custom formats
--
-- NOTE: These UPDATEs only affect plaintext records. Encrypted records
-- (content contains "_encrypted" key) are naturally skipped by the
-- field-existence guards and must be migrated at the application layer.

-- ============================================================
-- Part 1: Flatten existing note content to { "body": "..." }
-- ============================================================

-- SOAP → body
UPDATE clinical_notes
SET content = jsonb_build_object(
  'body',
  'SUBJECTIVE' || E'\n' || (content->>'subjective') || E'\n\n' ||
  'OBJECTIVE' || E'\n' || (content->>'objective') || E'\n\n' ||
  'ASSESSMENT' || E'\n' || (content->>'assessment') || E'\n\n' ||
  'PLAN' || E'\n' || (content->>'plan')
)
WHERE note_format = 'soap'
  AND content ? 'subjective'
  AND NOT content ? 'body';

-- DAP → body
UPDATE clinical_notes
SET content = jsonb_build_object(
  'body',
  'DATA' || E'\n' || (content->>'data') || E'\n\n' ||
  'ASSESSMENT' || E'\n' || (content->>'assessment') || E'\n\n' ||
  'PLAN' || E'\n' || (content->>'plan')
)
WHERE note_format = 'dap'
  AND content ? 'data'
  AND NOT content ? 'body';

-- BIRP → body
UPDATE clinical_notes
SET content = jsonb_build_object(
  'body',
  'BEHAVIOUR' || E'\n' || (content->>'behaviour') || E'\n\n' ||
  'INTERVENTION' || E'\n' || (content->>'intervention') || E'\n\n' ||
  'RESPONSE' || E'\n' || (content->>'response') || E'\n\n' ||
  'PLAN' || E'\n' || (content->>'plan')
)
WHERE note_format = 'birp'
  AND content ? 'behaviour'
  AND NOT content ? 'body';

-- GIRP → body
UPDATE clinical_notes
SET content = jsonb_build_object(
  'body',
  'GOALS' || E'\n' || (content->>'goals') || E'\n\n' ||
  'INTERVENTION' || E'\n' || (content->>'intervention') || E'\n\n' ||
  'RESPONSE' || E'\n' || (content->>'response') || E'\n\n' ||
  'PLAN' || E'\n' || (content->>'plan')
)
WHERE note_format = 'girp'
  AND content ? 'goals'
  AND NOT content ? 'body';

-- Narrative → body
UPDATE clinical_notes
SET content = jsonb_build_object(
  'body',
  'CLINICAL OPENING' || E'\n' || (content->>'clinicalOpening') || E'\n\n' ||
  'SESSION BODY' || E'\n' || (content->>'sessionBody') || E'\n\n' ||
  'CLINICAL SYNTHESIS' || E'\n' || (content->>'clinicalSynthesis') || E'\n\n' ||
  'THE PATH FORWARD' || E'\n' || (content->>'pathForward')
)
WHERE note_format = 'narrative'
  AND content ? 'clinicalOpening'
  AND NOT content ? 'body';

-- ============================================================
-- Part 2: Create custom_note_formats table
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_note_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sections JSONB NOT NULL,
  general_rules TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT custom_note_formats_unique_name UNIQUE (therapist_id, name),
  CONSTRAINT custom_note_formats_unique_slug UNIQUE (therapist_id, slug),
  CONSTRAINT custom_note_formats_sections_valid
    CHECK (jsonb_typeof(sections) = 'array' AND jsonb_array_length(sections) >= 1)
);

CREATE INDEX IF NOT EXISTS custom_note_formats_therapist_id_idx
  ON custom_note_formats(therapist_id);

-- ============================================================
-- Part 3: Enable RLS
-- ============================================================

ALTER TABLE custom_note_formats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists can manage their own formats"
  ON custom_note_formats
  FOR ALL
  USING (therapist_id = auth.uid())
  WITH CHECK (therapist_id = auth.uid());

-- ============================================================
-- Part 4: Add updated_at trigger
-- ============================================================

CREATE TRIGGER update_custom_note_formats_updated_at
  BEFORE UPDATE ON custom_note_formats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Part 5: Relax note_format CHECK constraint for custom formats
-- ============================================================

ALTER TABLE clinical_notes DROP CONSTRAINT IF EXISTS clinical_notes_note_format_check;
ALTER TABLE clinical_notes
  ADD CONSTRAINT clinical_notes_note_format_check
  CHECK (
    note_format IN ('soap', 'dap', 'birp', 'girp', 'narrative')
    OR note_format LIKE 'custom:%'
  );
