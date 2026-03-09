-- Add 'reviewed' to the allowed values for therapy_sessions.notes_status
-- This enables the sessions list page to show the "Reviewed" badge when a
-- therapist has reviewed AI-generated notes but not yet finalised them.

ALTER TABLE therapy_sessions
  DROP CONSTRAINT IF EXISTS therapy_sessions_notes_status_check;

ALTER TABLE therapy_sessions
  ADD CONSTRAINT therapy_sessions_notes_status_check
  CHECK (notes_status IN ('none', 'generating', 'draft', 'reviewed', 'finalised'));
