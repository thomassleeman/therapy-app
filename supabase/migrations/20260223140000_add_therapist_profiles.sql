-- =============================================================================
-- Migration: Add therapist_profiles table
-- =============================================================================
--
-- Stores therapist-level settings that are independent of any particular
-- client. The immediate need is `jurisdiction` (UK vs EU) so the RAG search
-- tools can scope legislation and guidelines correctly. `default_modality`
-- and `professional_body` are included now to avoid a follow-up migration
-- for data we'll need soon.
--
-- Dependency: Runs after 20260218153030_hybrid_search_add_document_title.sql
-- =============================================================================


-- ============================================================================
-- 1. therapist_profiles table
-- ============================================================================
-- One row per therapist. Uses the auth.users ID as the primary key (1:1
-- relationship — a profile is meaningless without the user).
--
-- jurisdiction:     Required. Determines which legislation and professional
--                   body guidelines are surfaced by the search tools. UK
--                   covers England, Wales, Scotland, and Northern Ireland.
--                   EU currently covers the Republic of Ireland and is
--                   designed to extend to other EU member states in future.
--
-- default_modality: Optional. The therapist's primary therapeutic approach,
--                   used as a fallback when no per-client modality is set.
--                   Values must match the knowledge_chunks.modality domain
--                   so they can be passed directly to the search tools.
--
-- professional_body: Optional. The therapist's primary regulatory/professional
--                    body (e.g. BACP, UKCP, HCPC for UK; IACP, CORU for
--                    Ireland). Will be used to further scope guideline
--                    searches to the most relevant standards.

CREATE TABLE IF NOT EXISTS public.therapist_profiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  jurisdiction      TEXT        NOT NULL CHECK (jurisdiction IN ('UK', 'EU')),
  default_modality  TEXT        CHECK (default_modality IS NULL OR default_modality IN (
                                  'cbt', 'person_centred', 'psychodynamic'
                                )),
  professional_body TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.therapist_profiles IS
  'Therapist-level settings (jurisdiction, default modality, professional body). '
  'One row per therapist. Created during onboarding or lazily on first chat.';

COMMENT ON COLUMN public.therapist_profiles.jurisdiction IS
  'UK or EU. Controls which legislation and professional body guidelines the '
  'search tools surface. UK covers England, Wales, Scotland, and Northern '
  'Ireland. EU currently covers the Republic of Ireland and is designed to '
  'extend to other EU member states in future.';

COMMENT ON COLUMN public.therapist_profiles.default_modality IS
  'Fallback modality for search tool filtering when the selected client has no '
  'therapeutic_modalities set. Values must match the knowledge_chunks.modality '
  'domain exactly (lowercase, underscored).';


-- ============================================================================
-- 2. Auto-update updated_at on row changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER therapist_profiles_updated_at
  BEFORE UPDATE ON public.therapist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 3. RLS policies
-- ============================================================================
-- Therapists can only read and update their own profile.
-- INSERT is allowed so the app can create the profile during onboarding.
-- DELETE is allowed for account cleanup / GDPR right-to-erasure.
-- The ON DELETE CASCADE on the FK handles deletion when the auth user is removed.

ALTER TABLE public.therapist_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists can read own profile"
  ON public.therapist_profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Therapists can insert own profile"
  ON public.therapist_profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Therapists can update own profile"
  ON public.therapist_profiles
  FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Therapists can delete own profile"
  ON public.therapist_profiles
  FOR DELETE
  USING (id = auth.uid());