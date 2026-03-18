# GDPR Compliance Audit Report

**Date:** 2026-03-16
**Repository:** `thomassleeman/therapy-app`
**Audited by:** Claude (AI-assisted audit)

## Overall Assessment: **Not yet compliant**

Strong technical foundations, but critical gaps in legal/administrative requirements and some technical issues.

---

## Critical Issues (Must Fix Before Launch)

### 1. No Privacy Policy or Terms of Service

No `/privacy`, `/terms`, or equivalent pages exist. GDPR Articles 13/14 require a privacy notice at the point of data collection. Therapists have no way to understand what data is collected, how it's processed, or their rights.

### 2. No Signup Consent for Special Category Data

The sign-up page (`app/(auth-pages)/sign-up/page.tsx`) collects email/password with **no GDPR disclosure or consent checkboxes**. Processing mental health data (Article 9) requires explicit, informed consent before processing begins.

### 3. No Account Deletion Mechanism (Article 17)

No account deletion UI or API endpoint exists. The sign-out action (`app/actions.ts:173-177`) only logs out — it doesn't delete data. While CASCADE DELETE constraints exist in the DB, there's **no way for users to exercise their right to erasure**.

### 4. No Data Export (Article 20 — Data Portability)

No mechanism to export personal data in a portable format. Therapists cannot retrieve their data before leaving the platform.

### 5. OpenAI Whisper — No EU Data Residency

`lib/transcription/providers/whisper-api.ts` sends **raw audio** (the highest-risk data — client voices, mental health disclosures) to OpenAI's US infrastructure. No EU region option exists for Whisper. This is the biggest single GDPR risk for Article 9 data.

### 6. No DPIA (Data Protection Impact Assessment)

Mandatory under UK GDPR when processing special category data at scale using novel technology. Already flagged in CLAUDE.md as "on the horizon" but not done.

### 7. No ICO Registration

Also flagged in CLAUDE.md — required before processing personal data in the UK (~£40/year).

---

## High Priority Issues

### 8. Production Logging Exposes Therapy Data

Multiple `console.log` calls in production code leak sensitive metadata:

- `lib/ai/tools/knowledge-search-tools.ts:217` — search queries + document titles (no `NODE_ENV` guard)
- `app/(chat)/api/chat/route.ts:382` — chatId + token counts
- `app/(chat)/api/chat/route.ts:258` — sensitive content categories
- `app/(chat)/api/chat/route.ts:523` — faithfulness chatId
- `lib/transcription/index.ts:48` — transcript metadata

**Fix:** Wrap all non-error logging in `if (process.env.NODE_ENV === "development")` guards.

### 9. Vercel AI Gateway Adds Unclear Proxy Layer

`lib/ai/providers.ts` routes LLM calls through Vercel AI Gateway, adding a proxy layer with unclear data handling/retention policies. Consider switching to direct Anthropic SDK calls as recommended in CLAUDE.md.

### 10. Geolocation Forwarded to LLM

`app/(chat)/api/chat/route.ts:121-128` captures lat/long/city/country from Vercel geolocation and sends it to Claude in the system prompt. Consider whether this is necessary, or at minimum round to country level.

### 11. Missing Storage RLS on `uploads` Bucket

`app/(chat)/api/files/upload/route.ts` uses path-based isolation but no RLS policies are defined on the `uploads` storage bucket in migrations. Direct Supabase API access could bypass this.

### 12. No Data Retention Policies

No TTLs, scheduled cleanup, or automated purging. The session creation page text references "data retention settings" that **don't exist**. Therapists must manually delete everything.

### 13. Clinical Notes Not Individually Deletable

No DELETE endpoint for clinical notes — they can only be deleted indirectly by deleting the parent session.

---

## Medium Priority

### 14. Cookie Consent

Two non-essential cookies (`sidebar_state`, `chat-model`) are set without consent. Either add a cookie consent banner or convert these to `localStorage`.

### 15. No Records of Processing Activities (ROPA — Article 30)

No formal documentation of data categories, retention periods, processor contracts, or third-party flows.

### 16. No DPO Contact

No Data Protection Officer contact or process documented.

### 17. Client Deletion Orphans Sessions

Migration `supabase/migrations/20260303000000_add_session_transcription.sql:24`: `therapy_sessions.client_id` uses `ON DELETE SET NULL` instead of `CASCADE`, leaving orphaned session records when a client is deleted.

### 18. Audio Deletion Not Transactional

`app/api/sessions/[id]/route.ts:62-73`: If audio storage deletion fails, the session record is still deleted, orphaning the audio file.

---

## What's Working Well

| Area | Status |
|------|--------|
| **Encryption at rest** | AES-256-GCM on all sensitive clinical content (transcripts, notes, documents, messages, audio) |
| **Embedding data residency** | AWS Bedrock `eu-west-1` (Ireland) — locked in `lib/ai/embedding.ts` |
| **Transcription data residency (AssemblyAI)** | EU endpoint (`api.eu.assemblyai.com`, Dublin) — default provider |
| **RLS on all 18 user data tables** | Comprehensive policies enforcing `therapist_id = auth.uid()` |
| **API auth on all routes** | Every route checks `auth()` and returns 401 if missing |
| **Session-level consent tracking** | `session_consents` table with recording/transcription/AI/storage consent types |
| **No analytics/tracking** | Zero third-party tracking code (GA, Mixpanel, etc.) |
| **Storage bucket RLS** | `session-audio` bucket properly isolated per therapist |
| **Dev logging system** | Correctly feature-gated, user IDs hashed, content truncated |
| **Service role key** | Server-side only, used after auth verification |
| **CASCADE DELETE architecture** | Well-designed foreign key constraints enabling cascading data deletion |
| **Per-record encryption keys** | HKDF-SHA256 key derivation — each record has a unique derived key |

---

## Deletion Capabilities Summary

| Entity | Endpoint | Direct Delete | Cascade | Audio Cleanup |
|--------|----------|---------------|---------|---------------|
| Chat | `DELETE /api/chat?id={id}` | Yes | Yes (messages, votes) | N/A |
| All Chats | `DELETE /api/history` | Yes (bulk) | Yes | N/A |
| Client | `DELETE /api/clients/{id}` | Yes | Yes (documents, tags, sessions→SET NULL) | N/A |
| Session | `DELETE /api/sessions/{id}` | Yes | Yes (segments, notes, consents) | Yes (explicit) |
| Clinical Doc | `DELETE /api/documents/{id}` | Yes | Yes (references) | N/A |
| Clinical Note | None | No | Indirect only (via session) | N/A |
| Tag | `DELETE /api/tags?id={id}` | Yes | N/A | N/A |
| Account | None | No | DB cascades exist but no endpoint | No storage cleanup |

---

## Recommended Action Plan

| Priority | Action | Effort |
|----------|--------|--------|
| **1** | Create Privacy Policy + Terms of Service pages | 2-3 days (legal review needed) |
| **2** | Add signup consent flow (Article 9 explicit consent) | 1-2 days |
| **3** | Build account deletion endpoint + UI | 2-3 days |
| **4** | Add `NODE_ENV` guards to all production logging | 1 day |
| **5** | Evaluate removing Whisper fallback or restricting to EU-compliant provider | Research task |
| **6** | Commission DPIA | 5-10 days |
| **7** | Build data export endpoint (Article 20) | 2-3 days |
| **8** | Add RLS policies to `uploads` storage bucket | 1 hour |
| **9** | Complete ICO registration | Administrative |
| **10** | Convert non-essential cookies to localStorage or add consent banner | 1 day |
| **11** | Create clinical note DELETE endpoint | 1 day |
| **12** | Make audio deletion transactional (delete audio before DB record) | 0.5 days |
| **13** | Fix client deletion to CASCADE sessions instead of SET NULL | 0.5 days |
| **14** | Remove geolocation from LLM system prompt or reduce to country-level | 0.5 days |
| **15** | Prepare ROPA documentation (Article 30) | 2-3 days |

---

## Summary

The technical architecture is genuinely privacy-by-design — encryption at rest, EU data residency for embeddings and transcription, comprehensive RLS, no tracking. The gaps are primarily in:

1. **Legal documentation** (privacy policy, terms, DPIA, ROPA)
2. **User-facing compliance UI** (account deletion, data export, consent flow)
3. **Production logging hygiene** (sensitive data in logs)
4. **Whisper fallback EU data residency** (biggest technical risk)

The CASCADE DELETE infrastructure in the database means that implementing account deletion and data export is straightforward engineering work — the hard part (data modelling) is already done.
