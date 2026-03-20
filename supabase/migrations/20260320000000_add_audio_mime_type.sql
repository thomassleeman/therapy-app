-- Add audio_mime_type column to therapy_sessions.
-- Stores the normalised IANA MIME type of the uploaded audio file.
-- Nullable because sessions created before this migration won't have it,
-- and sessions that haven't had audio uploaded yet have no MIME type.

ALTER TABLE therapy_sessions
ADD COLUMN IF NOT EXISTS audio_mime_type TEXT;

COMMENT ON COLUMN therapy_sessions.audio_mime_type IS
  'Normalised IANA MIME type of the uploaded audio file (e.g. audio/webm, audio/wav, audio/mp4, audio/mpeg). Set at upload time, read at transcription time.';
