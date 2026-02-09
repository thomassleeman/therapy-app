-- Migration: Expand client profile fields
-- Adds structured clinical, practice management, and professional note fields to clients.
-- Creates a tags system for flexible client labelling.
-- Drops emergency_contact intentionally — sensitive PII that therapists store elsewhere.

-- ============================================================
-- 1. New columns on public.clients
-- ============================================================

-- Therapeutic approach
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS therapeutic_modalities text[] DEFAULT '{}';

-- Clinical context
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS presenting_issues text,
  ADD COLUMN IF NOT EXISTS treatment_goals text,
  ADD COLUMN IF NOT EXISTS risk_considerations text;

-- Practice management
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'discharged', 'waitlisted'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS session_frequency text
    CHECK (session_frequency IS NULL OR session_frequency IN ('weekly', 'fortnightly', 'monthly', 'ad-hoc'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS delivery_method text
    CHECK (delivery_method IS NULL OR delivery_method IN ('in-person', 'online', 'telephone', 'hybrid'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS therapy_start_date date;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS referral_source text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS age_bracket text
    CHECK (age_bracket IS NULL OR age_bracket IN ('child', 'adolescent', 'young-adult', 'adult', 'older-adult'));

-- Contract details
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS session_duration_minutes integer
    CHECK (session_duration_minutes IS NULL OR session_duration_minutes > 0);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contracted_sessions integer
    CHECK (contracted_sessions IS NULL OR contracted_sessions > 0);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS fee_per_session numeric(10,2);

-- Professional notes
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS supervisor_notes text;

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);

-- ============================================================
-- 2. Tags system
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(therapist_id, name)
);

CREATE TABLE IF NOT EXISTS public.client_tag_assignments (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.client_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, tag_id)
);

-- RLS
ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists can read own tags" ON public.client_tags
  FOR SELECT USING (therapist_id = auth.uid());

CREATE POLICY "Therapists can insert own tags" ON public.client_tags
  FOR INSERT WITH CHECK (therapist_id = auth.uid());

CREATE POLICY "Therapists can update own tags" ON public.client_tags
  FOR UPDATE USING (therapist_id = auth.uid());

CREATE POLICY "Therapists can delete own tags" ON public.client_tags
  FOR DELETE USING (therapist_id = auth.uid());

CREATE POLICY "Therapists can read own tag assignments" ON public.client_tag_assignments
  FOR SELECT USING (
    client_id IN (SELECT id FROM public.clients WHERE therapist_id = auth.uid())
  );

CREATE POLICY "Therapists can insert own tag assignments" ON public.client_tag_assignments
  FOR INSERT WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE therapist_id = auth.uid())
  );

CREATE POLICY "Therapists can delete own tag assignments" ON public.client_tag_assignments
  FOR DELETE USING (
    client_id IN (SELECT id FROM public.clients WHERE therapist_id = auth.uid())
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_tags_therapist ON public.client_tags(therapist_id);
CREATE INDEX IF NOT EXISTS idx_client_tag_assignments_client ON public.client_tag_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tag_assignments_tag ON public.client_tag_assignments(tag_id);

-- ============================================================
-- 3. Atomic tag-setting RPC function
-- ============================================================
-- Wraps delete + insert in a single transaction to avoid partial states.

CREATE OR REPLACE FUNCTION set_client_tags(
  p_client_id uuid,
  p_tag_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller owns this client
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND therapist_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: client not found or not owned by user';
  END IF;

  -- Delete existing assignments
  DELETE FROM public.client_tag_assignments
  WHERE client_id = p_client_id;

  -- Insert new assignments
  IF array_length(p_tag_ids, 1) IS NOT NULL THEN
    INSERT INTO public.client_tag_assignments (client_id, tag_id)
    SELECT p_client_id, unnest(p_tag_ids);
  END IF;
END;
$$;
