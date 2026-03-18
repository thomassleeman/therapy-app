-- Add 'written_notes' recording type and 'not_applicable' transcription status

-- 1. Update recording_type CHECK constraint
ALTER TABLE therapy_sessions
  DROP CONSTRAINT IF EXISTS therapy_sessions_recording_type_check;

ALTER TABLE therapy_sessions
  ADD CONSTRAINT therapy_sessions_recording_type_check
  CHECK (recording_type IN ('full_session', 'therapist_summary', 'written_notes'));

-- 2. Update transcription_status CHECK constraint
ALTER TABLE therapy_sessions
  DROP CONSTRAINT IF EXISTS therapy_sessions_transcription_status_check;

ALTER TABLE therapy_sessions
  ADD CONSTRAINT therapy_sessions_transcription_status_check
  CHECK (transcription_status IN (
    'pending', 'uploading', 'preparing',
    'transcribing', 'labelling', 'saving', 'completed', 'failed',
    'not_applicable'
  ));

-- 3. Add written_notes column
ALTER TABLE therapy_sessions
  ADD COLUMN IF NOT EXISTS written_notes TEXT DEFAULT NULL;

COMMENT ON COLUMN therapy_sessions.written_notes IS 'Original unformatted text entered by the therapist for written_notes recording type sessions';
