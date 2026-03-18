-- Add 'preparing' and 'saving' to transcription status CHECK constraint
ALTER TABLE therapy_sessions
  DROP CONSTRAINT IF EXISTS therapy_sessions_transcription_status_check;

ALTER TABLE therapy_sessions
  ADD CONSTRAINT therapy_sessions_transcription_status_check
  CHECK (transcription_status IN (
    'pending', 'uploading', 'preparing',
    'transcribing', 'labelling', 'saving', 'completed', 'failed'
  ));
