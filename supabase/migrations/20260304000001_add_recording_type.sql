ALTER TABLE therapy_sessions
  ADD COLUMN recording_type TEXT NOT NULL DEFAULT 'full_session'
    CHECK (recording_type IN ('full_session', 'therapist_summary'));

COMMENT ON COLUMN therapy_sessions.recording_type IS 'full_session = recorded/uploaded therapy session audio; therapist_summary = therapist narrating a post-session summary';
