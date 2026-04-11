-- Migration: Flatten clinical document content from Record<string, string> to { body: string }
--
-- Documents use type-specific section keys in their content JSONB column.
-- This migration concatenates all sections (with UPPERCASE labels) into a single body string.
-- Each document type has its own UPDATE statement to preserve correct section ordering.
--
-- NOTE: These UPDATEs only affect plaintext records. Encrypted records
-- (content contains "_encrypted" key) are naturally skipped by the
-- field-existence guards and must be migrated at the application layer
-- via scripts/flatten-document-content.ts.

-- ============================================================
-- Comprehensive Assessment
-- ============================================================
UPDATE clinical_documents
SET content = jsonb_build_object(
  'body',
  'REFERRAL & CONTEXT' || E'\n' || COALESCE(content->>'referral_context', '') || E'\n\n' ||
  'PRESENTING PROBLEMS' || E'\n' || COALESCE(content->>'presenting_problems', '') || E'\n\n' ||
  'RELEVANT HISTORY' || E'\n' || COALESCE(content->>'history', '') || E'\n\n' ||
  'CURRENT FUNCTIONING' || E'\n' || COALESCE(content->>'current_functioning', '') || E'\n\n' ||
  'RISK SCREENING' || E'\n' || COALESCE(content->>'risk_screen', '') || E'\n\n' ||
  'STRENGTHS & RESOURCES' || E'\n' || COALESCE(content->>'strengths_resources', '') || E'\n\n' ||
  'CLINICAL IMPRESSIONS' || E'\n' || COALESCE(content->>'clinical_impressions', '')
)
WHERE document_type = 'comprehensive_assessment'
  AND content ? 'referral_context'
  AND NOT content ? 'body';

-- ============================================================
-- Case Formulation
-- ============================================================
UPDATE clinical_documents
SET content = jsonb_build_object(
  'body',
  'SUMMARY OF DIFFICULTIES' || E'\n' || COALESCE(content->>'summary_of_difficulties', '') || E'\n\n' ||
  'PREDISPOSING FACTORS' || E'\n' || COALESCE(content->>'predisposing_factors', '') || E'\n\n' ||
  'PRECIPITATING FACTORS' || E'\n' || COALESCE(content->>'precipitating_factors', '') || E'\n\n' ||
  'PERPETUATING FACTORS' || E'\n' || COALESCE(content->>'perpetuating_factors', '') || E'\n\n' ||
  'PROTECTIVE FACTORS' || E'\n' || COALESCE(content->>'protective_factors', '') || E'\n\n' ||
  'WORKING HYPOTHESIS' || E'\n' || COALESCE(content->>'working_hypothesis', '') || E'\n\n' ||
  'IMPLICATIONS FOR TREATMENT' || E'\n' || COALESCE(content->>'implications_for_treatment', '')
)
WHERE document_type = 'case_formulation'
  AND content ? 'summary_of_difficulties'
  AND NOT content ? 'body';

-- ============================================================
-- Risk Assessment
-- ============================================================
UPDATE clinical_documents
SET content = jsonb_build_object(
  'body',
  'RISK TO SELF' || E'\n' || COALESCE(content->>'risk_to_self', '') || E'\n\n' ||
  'RISK TO OTHERS' || E'\n' || COALESCE(content->>'risk_to_others', '') || E'\n\n' ||
  'SAFEGUARDING CONCERNS' || E'\n' || COALESCE(content->>'safeguarding', '') || E'\n\n' ||
  'RISK FACTORS' || E'\n' || COALESCE(content->>'risk_factors', '') || E'\n\n' ||
  'PROTECTIVE FACTORS' || E'\n' || COALESCE(content->>'protective_factors', '') || E'\n\n' ||
  'OVERALL RISK LEVEL & RATIONALE' || E'\n' || COALESCE(content->>'overall_risk_level', '') || E'\n\n' ||
  'RECOMMENDED ACTIONS' || E'\n' || COALESCE(content->>'recommended_actions', '')
)
WHERE document_type = 'risk_assessment'
  AND content ? 'risk_to_self'
  AND NOT content ? 'body';

-- ============================================================
-- Risk & Safety Management Plan
-- ============================================================
UPDATE clinical_documents
SET content = jsonb_build_object(
  'body',
  'IDENTIFIED TRIGGERS' || E'\n' || COALESCE(content->>'identified_triggers', '') || E'\n\n' ||
  'WARNING SIGNS' || E'\n' || COALESCE(content->>'warning_signs', '') || E'\n\n' ||
  'COPING STRATEGIES' || E'\n' || COALESCE(content->>'coping_strategies', '') || E'\n\n' ||
  'SUPPORT CONTACTS' || E'\n' || COALESCE(content->>'support_contacts', '') || E'\n\n' ||
  'PROFESSIONAL & EMERGENCY CONTACTS' || E'\n' || COALESCE(content->>'professional_contacts', '') || E'\n\n' ||
  'MAKING THE ENVIRONMENT SAFE' || E'\n' || COALESCE(content->>'environment_safety', '') || E'\n\n' ||
  'REASONS FOR LIVING' || E'\n' || COALESCE(content->>'reasons_for_living', '') || E'\n\n' ||
  'REVIEW SCHEDULE' || E'\n' || COALESCE(content->>'review_schedule', '')
)
WHERE document_type = 'risk_safety_plan'
  AND content ? 'identified_triggers'
  AND NOT content ? 'body';

-- ============================================================
-- Treatment Plan
-- ============================================================
UPDATE clinical_documents
SET content = jsonb_build_object(
  'body',
  'PRESENTING PROBLEMS SUMMARY' || E'\n' || COALESCE(content->>'presenting_problems_summary', '') || E'\n\n' ||
  'TREATMENT GOALS' || E'\n' || COALESCE(content->>'treatment_goals', '') || E'\n\n' ||
  'PLANNED INTERVENTIONS' || E'\n' || COALESCE(content->>'interventions', '') || E'\n\n' ||
  'MODALITY & APPROACH' || E'\n' || COALESCE(content->>'modality_and_approach', '') || E'\n\n' ||
  'OUTCOME MEASURES' || E'\n' || COALESCE(content->>'outcome_measures', '') || E'\n\n' ||
  'RISK MANAGEMENT' || E'\n' || COALESCE(content->>'risk_management', '') || E'\n\n' ||
  'REVIEW POINTS' || E'\n' || COALESCE(content->>'review_points', '')
)
WHERE document_type = 'treatment_plan'
  AND content ? 'presenting_problems_summary'
  AND NOT content ? 'body';

-- ============================================================
-- Supervision Notes
-- ============================================================
UPDATE clinical_documents
SET content = jsonb_build_object(
  'body',
  'CLIENTS DISCUSSED' || E'\n' || COALESCE(content->>'clients_discussed', '') || E'\n\n' ||
  'CLINICAL GUIDANCE RECEIVED' || E'\n' || COALESCE(content->>'clinical_guidance', '') || E'\n\n' ||
  'ETHICAL REFLECTIONS' || E'\n' || COALESCE(content->>'ethical_reflections', '') || E'\n\n' ||
  'ACTION ITEMS' || E'\n' || COALESCE(content->>'action_items', '') || E'\n\n' ||
  'THERAPIST WELLBEING' || E'\n' || COALESCE(content->>'therapist_wellbeing', '')
)
WHERE document_type = 'supervision_notes'
  AND content ? 'clients_discussed'
  AND NOT content ? 'body';

-- ============================================================
-- Closing / Discharge Summary
-- ============================================================
UPDATE clinical_documents
SET content = jsonb_build_object(
  'body',
  'REFERRAL & PRESENTING PROBLEMS' || E'\n' || COALESCE(content->>'referral_summary', '') || E'\n\n' ||
  'TREATMENT SUMMARY' || E'\n' || COALESCE(content->>'treatment_summary', '') || E'\n\n' ||
  'PROGRESS & OUTCOMES' || E'\n' || COALESCE(content->>'progress_and_outcomes', '') || E'\n\n' ||
  'REMAINING DIFFICULTIES' || E'\n' || COALESCE(content->>'remaining_difficulties', '') || E'\n\n' ||
  'RISK AT DISCHARGE' || E'\n' || COALESCE(content->>'risk_at_discharge', '') || E'\n\n' ||
  'RECOMMENDATIONS' || E'\n' || COALESCE(content->>'recommendations', '') || E'\n\n' ||
  'REASON FOR ENDING' || E'\n' || COALESCE(content->>'reason_for_ending', '')
)
WHERE document_type = 'discharge_summary'
  AND content ? 'referral_summary'
  AND NOT content ? 'body';
