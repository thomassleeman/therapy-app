-- Allow clinical notes without a linked session (standalone notes).
-- Previously session_id was NOT NULL; this makes it optional so therapists
-- can create freeform notes from the client hub.

ALTER TABLE clinical_notes
  ALTER COLUMN session_id DROP NOT NULL;

-- Add client_id so standalone notes (no session) can be linked to a client.
-- For session-linked notes the client is reachable via therapy_sessions.client_id,
-- but standalone notes need a direct FK.
ALTER TABLE clinical_notes
  ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_notes_client_id
  ON clinical_notes(client_id);

-- Backfill client_id from existing session-linked notes
UPDATE clinical_notes cn
  SET client_id = ts.client_id
  FROM therapy_sessions ts
  WHERE cn.session_id = ts.id
    AND cn.client_id IS NULL;
