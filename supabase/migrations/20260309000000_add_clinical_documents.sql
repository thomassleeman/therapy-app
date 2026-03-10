-- Migration: Add clinical documents tables
-- These support client-level documents (assessments, formulations, treatment plans, etc.)
-- that span multiple sessions, separate from session-level clinical_notes.

-- Ensure the updated_at trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Clinical documents table
CREATE TABLE IF NOT EXISTS clinical_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (document_type IN (
      'comprehensive_assessment',
      'case_formulation',
      'risk_assessment',
      'risk_safety_plan',
      'treatment_plan',
      'supervision_notes',
      'discharge_summary'
    )),
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('generating', 'draft', 'reviewed', 'finalised')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES clinical_documents(id) ON DELETE SET NULL,
  generated_by TEXT NOT NULL DEFAULT 'ai'
    CHECK (generated_by IN ('ai', 'manual')),
  model_used TEXT,
  reviewed_at TIMESTAMPTZ,
  finalised_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for clinical_documents
CREATE INDEX IF NOT EXISTS idx_clinical_documents_client ON clinical_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_clinical_documents_therapist ON clinical_documents(therapist_id);
CREATE INDEX IF NOT EXISTS idx_clinical_documents_type ON clinical_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_clinical_documents_status ON clinical_documents(status);
CREATE INDEX IF NOT EXISTS idx_clinical_documents_supersedes ON clinical_documents(supersedes_id) WHERE supersedes_id IS NOT NULL;

-- 2. Clinical document references join table
CREATE TABLE IF NOT EXISTS clinical_document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES clinical_documents(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL
    CHECK (reference_type IN ('session', 'clinical_note', 'clinical_document')),
  reference_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for clinical_document_references
CREATE INDEX IF NOT EXISTS idx_doc_references_document ON clinical_document_references(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_references_target ON clinical_document_references(reference_type, reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_references_unique
  ON clinical_document_references(document_id, reference_type, reference_id);

-- 3. Row Level Security
ALTER TABLE clinical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_document_references ENABLE ROW LEVEL SECURITY;

-- RLS policies for clinical_documents
CREATE POLICY "Therapists can view own documents"
  ON clinical_documents FOR SELECT
  USING (therapist_id = auth.uid());

CREATE POLICY "Therapists can insert own documents"
  ON clinical_documents FOR INSERT
  WITH CHECK (therapist_id = auth.uid());

CREATE POLICY "Therapists can update own documents"
  ON clinical_documents FOR UPDATE
  USING (therapist_id = auth.uid());

CREATE POLICY "Therapists can delete own documents"
  ON clinical_documents FOR DELETE
  USING (therapist_id = auth.uid());

-- RLS policies for clinical_document_references (inherit access from parent document)
CREATE POLICY "Therapists can view own document references"
  ON clinical_document_references FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clinical_documents
      WHERE clinical_documents.id = clinical_document_references.document_id
      AND clinical_documents.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists can insert own document references"
  ON clinical_document_references FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clinical_documents
      WHERE clinical_documents.id = clinical_document_references.document_id
      AND clinical_documents.therapist_id = auth.uid()
    )
  );

CREATE POLICY "Therapists can delete own document references"
  ON clinical_document_references FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clinical_documents
      WHERE clinical_documents.id = clinical_document_references.document_id
      AND clinical_documents.therapist_id = auth.uid()
    )
  );

-- 4. Updated_at trigger
CREATE TRIGGER set_clinical_documents_updated_at
  BEFORE UPDATE ON clinical_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
