-- Migration: Update clinical_notes note_format to support new formats
-- Adds: birp, girp, narrative
-- Removes: progress, freeform (migrated to narrative)

-- Step 1: Migrate existing data
UPDATE clinical_notes
SET note_format = 'narrative'
WHERE note_format IN ('progress', 'freeform');

-- Step 2: Drop old constraint and add new one
ALTER TABLE clinical_notes DROP CONSTRAINT IF EXISTS clinical_notes_note_format_check;
ALTER TABLE clinical_notes
  ADD CONSTRAINT clinical_notes_note_format_check
  CHECK (note_format IN ('soap', 'dap', 'birp', 'girp', 'narrative'));
