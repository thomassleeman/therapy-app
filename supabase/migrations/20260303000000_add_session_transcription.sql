-- Migration: Add session transcription and clinical notes tables
-- Description: Creates tables for therapy session recording, transcription,
--              clinical note generation, and GDPR consent tracking.

-- =============================================================================
-- 1. TRIGGER FUNCTION: update_updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. TABLE: therapy_sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS therapy_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  chat_id UUID REFERENCES "Chat"(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  duration_minutes INTEGER CHECK (duration_minutes > 0),
  audio_storage_path TEXT,
  transcription_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcription_status IN ('pending', 'uploading', 'transcribing', 'labelling', 'completed', 'failed')),
  transcription_provider TEXT DEFAULT 'whisper',
  notes_status TEXT NOT NULL DEFAULT 'none'
    CHECK (notes_status IN ('none', 'generating', 'draft', 'finalised')),
  delivery_method TEXT
    CHECK (delivery_method IN ('in-person', 'online', 'telephone')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_therapy_sessions_therapist_id ON therapy_sessions(therapist_id);
CREATE INDEX IF NOT EXISTS idx_therapy_sessions_client_id ON therapy_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_therapy_sessions_session_date ON therapy_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_therapy_sessions_transcription_status ON therapy_sessions(transcription_status);

CREATE TRIGGER therapy_sessions_updated_at
  BEFORE UPDATE ON therapy_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 3. TABLE: session_segments
-- =============================================================================

CREATE TABLE IF NOT EXISTS session_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES therapy_sessions(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  content TEXT NOT NULL,
  start_time_ms INTEGER NOT NULL,
  end_time_ms INTEGER NOT NULL,
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_session_segments_session_id ON session_segments(session_id);

-- =============================================================================
-- 4. TABLE: clinical_notes
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES therapy_sessions(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_format TEXT NOT NULL
    CHECK (note_format IN ('soap', 'dap', 'progress', 'freeform')),
  content JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'finalised')),
  generated_by TEXT NOT NULL DEFAULT 'ai',
  model_used TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_notes_session_id ON clinical_notes(session_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_therapist_id ON clinical_notes(therapist_id);

CREATE TRIGGER clinical_notes_updated_at
  BEFORE UPDATE ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- 5. TABLE: session_consents
-- =============================================================================

CREATE TABLE IF NOT EXISTS session_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES therapy_sessions(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL
    CHECK (consent_type IN ('recording', 'ai_transcription', 'ai_note_generation', 'data_storage')),
  consenting_party TEXT NOT NULL
    CHECK (consenting_party IN ('therapist', 'client')),
  consented BOOLEAN NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  consent_method TEXT NOT NULL
    CHECK (consent_method IN ('in_app_checkbox', 'verbal_recorded', 'written_form', 'digital_signature')),
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, consent_type, consenting_party)
);

CREATE INDEX IF NOT EXISTS idx_session_consents_session_id ON session_consents(session_id);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

-- therapy_sessions
ALTER TABLE therapy_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists select own sessions"
  ON therapy_sessions FOR SELECT
  USING (therapist_id = auth.uid());

CREATE POLICY "Therapists insert own sessions"
  ON therapy_sessions FOR INSERT
  WITH CHECK (therapist_id = auth.uid());

CREATE POLICY "Therapists update own sessions"
  ON therapy_sessions FOR UPDATE
  USING (therapist_id = auth.uid());

CREATE POLICY "Therapists delete own sessions"
  ON therapy_sessions FOR DELETE
  USING (therapist_id = auth.uid());

-- session_segments
ALTER TABLE session_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists select own segments"
  ON session_segments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_segments.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists insert own segments"
  ON session_segments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_segments.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists update own segments"
  ON session_segments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_segments.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists delete own segments"
  ON session_segments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_segments.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

-- clinical_notes
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists select own notes"
  ON clinical_notes FOR SELECT
  USING (therapist_id = auth.uid());

CREATE POLICY "Therapists insert own notes"
  ON clinical_notes FOR INSERT
  WITH CHECK (therapist_id = auth.uid());

CREATE POLICY "Therapists update own notes"
  ON clinical_notes FOR UPDATE
  USING (therapist_id = auth.uid());

CREATE POLICY "Therapists delete own notes"
  ON clinical_notes FOR DELETE
  USING (therapist_id = auth.uid());

-- session_consents
ALTER TABLE session_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists select own consents"
  ON session_consents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_consents.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists insert own consents"
  ON session_consents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_consents.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists update own consents"
  ON session_consents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_consents.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists delete own consents"
  ON session_consents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM therapy_sessions ts
      WHERE ts.id = session_consents.session_id
      AND ts.therapist_id = auth.uid()
    )
  );

-- =============================================================================
-- 7. STORAGE RLS POLICIES: session-audio bucket
-- =============================================================================

CREATE POLICY "Therapists upload own session audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'session-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Therapists read own session audio"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'session-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Therapists delete own session audio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'session-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
