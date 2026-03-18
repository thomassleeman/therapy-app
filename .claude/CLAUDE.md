# CLAUDE.md — Pasu Health

> **Platform:** Pasu Health (`pasuhealth.com`)
> **Contact:** `contact@pasuhealth.com`
> **Registered address:** 167-169 Great Portland Street, 5th Floor, London, W1W 5PF
> **Repository:** `thomassleeman/therapy-app`
> **Primary developer:** Tom (TypeScript / Next.js)
> **Clinical collaborator:** Aaron (practicing therapist, content author)

## What This Is

An AI-powered reflective practice platform for qualified therapists in the UK and Ireland/EU. Therapists use it to reflect on client sessions, receive evidence-informed clinical guidance grounded in a curated knowledge base, record and transcribe sessions, and generate structured clinical notes and documents.

The strategic differentiator is **GDPR compliance and privacy-by-design** — therapists using general-purpose AI tools like ChatGPT likely breach GDPR when handling mental health data (special category data under Article 9). This platform is purpose-built for clinical confidentiality.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, `proxy.ts` instead of `middleware.ts`) |
| Language | TypeScript (strict mode, `strictNullChecks`) |
| Database | Supabase (PostgreSQL + pgvector, 512-dim embeddings) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI / LLM | Vercel AI SDK v6, Anthropic Claude (via `@ai-sdk/anthropic`) |
| Embeddings | Cohere Embed v4 at 512 dimensions via AWS Bedrock (`eu-west-1`), called through `@aws-sdk/client-bedrock-runtime` |
| Transcription | AssemblyAI EU endpoint (`api.eu.assemblyai.com`, Dublin) — speech-to-text + speaker diarisation in a single call using `speech_models: ["universal-3-pro", "universal-2"]`. Fallback to OpenAI Whisper + Claude diarisation via env vars. Provider abstraction in `lib/transcription/`. |
| Encryption | AES-256-GCM with HKDF-SHA256 key derivation (Node.js `crypto`, zero dependencies) |
| UI | Tailwind CSS, shadcn/ui, Tiptap editor |
| Linting | Biome (via `ultracite` presets) |
| Testing | Playwright (E2E), Vitest (unit) |
| Package manager | pnpm |
| Node version | 22 (LTS) |

---

## Project Structure

```
app/
├── (app)/              # All authenticated non-chat pages (unified sidebar layout)
│   ├── page.tsx                    # Dashboard
│   ├── clients/                    # Client list, client hub, clinical documents
│   ├── sessions/                   # Session list, new session, session detail
│   └── settings/                   # Settings area (profile, account, privacy, about)
├── (auth-pages)/       # Sign-in, sign-up, password reset (no sidebar)
├── (chat)/             # Chat interface (own layout with DataStreamProvider)
│   ├── api/chat/                   # Chat route + stream resumption
│   ├── api/clients/                # Client CRUD API for chat context
│   └── chat/                       # Chat pages (new, [id])
├── api/                # Standalone API routes
│   ├── documents/                  # Clinical document generation + CRUD
│   ├── notes/generate/             # Clinical note generation from transcripts
│   ├── sessions/                   # Session CRUD + transcript retrieval
│   └── transcription/              # Audio upload + processing pipeline
└── auth/               # OAuth callback routes

components/             # React components (client-side)
├── transcription/      # Audio recorder, file upload
├── documents/          # Document generation form, viewer
├── ui/                 # shadcn/ui primitives
└── *.tsx               # Page-level components, sidebar, chat UI

lib/
├── ai/
│   ├── agents/         # ToolLoopAgent definition (therapy-reflection-agent.ts)
│   ├── tools/          # LLM tools: knowledge search (x4), create/update document
│   ├── prompts.ts      # System prompt construction
│   ├── confidence.ts   # Three-tier confidence thresholds for RAG results
│   ├── confidence-router.ts   # CRAG-style routing based on confidence
│   ├── contextual-response.ts # No-results / low-confidence fallback formatting
│   ├── sensitive-content.ts   # Keyword-based safety detection (safeguarding, etc.)
│   ├── modality.ts     # Modality resolution chain (chat → client → therapist → null)
│   ├── query-reformulation.ts # Multi-query retrieval via LLM reformulation
│   ├── parallel-search.ts     # RRF merging for parallel query variants
│   ├── rerank.ts       # Cohere cross-encoder reranking
│   ├── faithfulness-check.ts  # Post-generation grounding verification
│   ├── embedding.ts    # Centralised Cohere Embed v4 provider (AWS Bedrock eu-west-1)
│   ├── models.ts       # Available LLM models
│   └── providers.ts    # Model provider configuration
├── db/
│   ├── queries.ts      # All Supabase query functions
│   ├── types.ts        # TypeScript types for DB entities
│   └── faithfulness.ts # Faithfulness check persistence
├── dev/                # Dev-only RAG quality logging (behind DEV_LOGGING env var)
├── documents/          # Clinical documents system (types, context assembly, specs/)
├── encryption/         # Application-level encryption (AES-256-GCM)
│   ├── crypto.ts       # Core primitives: encrypt, decrypt, encryptBuffer, decryptBuffer, isEncrypted
│   ├── fields.ts       # Field helpers: encryptField, decryptField, encryptJsonb, decryptJsonb, encryptSegments, decryptSegments
│   └── __tests__/      # Vitest test suites for crypto.ts and fields.ts
├── transcription/      # Transcription abstraction layer (AssemblyAI default, Whisper + Claude fallback)
├── types/
│   └── knowledge.ts    # Single source of truth for RAG enums (categories, modalities, jurisdictions)
├── auth.ts             # Supabase auth wrapper
└── errors.ts           # Typed error classes

scripts/
├── ingest-knowledge.ts # Knowledge base ingestion CLI (--dry-run, --with-context, --with-parents)
├── encrypt-all.ts      # Run all encryption migration scripts in sequence
├── encrypt-session-segments.ts  # Migrate plaintext session_segments to encrypted
├── encrypt-clinical-notes.ts    # Migrate plaintext clinical_notes to encrypted
├── encrypt-clinical-documents.ts # Migrate plaintext clinical_documents to encrypted
├── encrypt-chat-messages.ts     # Migrate plaintext Message_v2 to encrypted
├── encryption-migrate-utils.ts  # Shared helpers for migration scripts
└── lib/                # Chunking strategies, contextual enrichment, parent-child chunker

knowledge-base/         # Markdown content authored by Aaron (ingested, content authoring ongoing)
├── therapeutic-content/ # CBT, PCT, GAD subdirectories
├── guidelines/          # BACP, UKCP
├── legislation/         # UK, EU
└── clinical-practice/   # Documentation, record-keeping guidance

supabase/migrations/    # Ordered SQL migrations
tests/                  # Playwright E2E + fixtures
```

---

## Key Conventions

### Code Style

- **Biome** for linting and formatting (extends `ultracite/biome/core`, `ultracite/biome/next`, `ultracite/biome/react`)
- 2-space indentation
- No `any` types — use `unknown` or proper generics
- `import type` for type-only imports
- Kebab-case filenames (`use-audio-recorder.ts`, not `useAudioRecorder.ts`)
- `for...of` loops preferred over `.forEach()` (Biome rule)
- Non-null assertions (`!`) replaced with `?? ""` fallbacks (Biome rule)
- **Key-based remount for stateful pages:** Client component pages that accumulate state across a multi-step flow (e.g. `sessions/new`) must use a wrapper + keyed inner component pattern to guarantee fresh `useState` on every client-side navigation. Next.js App Router may reuse component instances when navigating back to the same route, preserving stale state. Pattern: default export renders `<InnerForm key={formKey} />` where `formKey` changes per visit (see `app/(app)/sessions/new/page.tsx`).

### Database

- **Newer tables use `snake_case`** (`therapy_sessions`, `clinical_notes`, `therapist_profiles`, `knowledge_documents`)
- **Legacy tables use `PascalCase`** (`"Chat"`, `"Message_v2"`) — always quote these in SQL
- All queries go through `lib/db/queries.ts` using the Supabase client from `@/utils/supabase/server`
- Error handling via `handleSupabaseError(error, context)` helper
- "Not found" errors (code `PGRST116`) return `null` rather than throwing
- TypeScript types use camelCase, mapped from snake_case DB columns

### Migrations

- Located in `supabase/migrations/` with timestamp prefix (`YYYYMMDDHHMMSS_description.sql`)
- Must be idempotent (`IF NOT EXISTS`, `DROP IF EXISTS` before recreate)
- Run locally with `pnpm db:push`, apply to hosted Supabase via Dashboard or CLI
- When changing column types, drop all referencing indexes BEFORE `ALTER TABLE`

### Shared Types

- `lib/types/knowledge.ts` is the **single source of truth** for RAG enums (`DOCUMENT_CATEGORIES`, `JURISDICTIONS`, `MODALITIES`, `THERAPY_STAGES`)
- Imported by ingestion scripts, search tools, DB types, and UI components
- The jurisdiction value is `"EU"` (not `"IE"`) throughout — supports expansion to EU member states beyond Ireland

### AI / Agent

- The chat agent is a `ToolLoopAgent` defined in `lib/ai/agents/therapy-reflection-agent.ts`
- Default model: `claude-sonnet-4-5-20250929`
- `stopWhen: stepCountIs(6)` — allows up to 5 tool calls per turn
- Tools are registered via factory functions that accept a `{ session }` parameter
- The system prompt is assembled in `lib/ai/prompts.ts` via `systemPrompt()` which composes: base prompt + orientation prompt + tool context prompt + sensitive content directives + session transcript context

### Knowledge Base Content

- All metadata is derived from YAML frontmatter fields — folder names are irrelevant to ingestion
- Legislation content is authored as practitioner-oriented briefings (not raw statutory text)
- Content authored by Aaron, not scraped or licensed
- Chunking strategies are content-type-specific (legislation ≈ guidelines, therapeutic content uses semantic chunking)

### Encryption

- All sensitive clinical content is encrypted at the application layer before storage in Supabase
- Algorithm: AES-256-GCM (authenticated encryption) with per-record keys derived via HKDF-SHA256
- Implementation uses only Node.js built-in `crypto` module — zero external dependencies
- Encryption boundary is the server: browser sends/receives plaintext over TLS, server encrypts before writing to Supabase and decrypts after reading
- Master key stored as `ENCRYPTION_MASTER_KEY` environment variable (64-char hex, 32 bytes), never in the database
- Per-record keys derived from master key + record UUID via HKDF — each record has a unique derived key
- Envelope format: `[version (2 bytes "v1")] [IV (12 bytes)] [auth tag (16 bytes)] [ciphertext]`, stored as base64 in TEXT columns or raw bytes in Storage
- JSONB columns use a `{ _encrypted: "base64..." }` wrapper to remain valid JSONB
- Transcript segments use per-segment key derivation: `${sessionId}:segment:${index}`
- `isEncrypted()` check enables plaintext passthrough during migration — reads handle both encrypted and plaintext data transparently
- This is **not** end-to-end encryption: the server processes plaintext in memory (required for AI features). It is application-level encryption at rest, protecting against database breach, backup exposure, infrastructure provider access, and legal compulsion on Supabase

#### Encrypted columns

| Table | Column | Type | Key derivation context |
|---|---|---|---|
| `session_segments` | `content` | TEXT | `${sessionId}:segment:${segmentIndex}` |
| `clinical_notes` | `content` | JSONB | Note UUID |
| `clinical_documents` | `content` | JSONB | Document UUID |
| `"Message_v2"` | `content` | JSONB | Message UUID |
| `session-audio` bucket | file data | Binary | Session UUID |

#### Not encrypted (metadata needed for queries)

Session dates, statuses, document types, speaker labels, timestamps, IDs — these are needed for filtering and don't contain identifiable health content.

---

## RAG Pipeline

```
Therapist types message
    ↓
Chat route: auth + fetch therapist profile + client record
    ↓
Sensitive content detection (keyword-based, <1ms)
  → If detected: augments system prompt with safety directives + forced search queries
    ↓
Modality resolution chain: per-chat override → client default → therapist default → null
    ↓
System prompt assembly (role + orientation + tool context + sensitive content + session transcript)
    ↓
ToolLoopAgent runs (up to 6 steps)
  → LLM decides to call search tools
  → Tool generates 512-dim embedding via Cohere Embed v4 on AWS Bedrock eu-west-1 (see lib/ai/embedding.ts)
  → Optional: query reformulation (3 clinical variants via gpt-4o-mini)
  → Optional: parallel search + RRF merge
  → hybrid_search RPC executes (vector similarity + full-text search, merged via RRF)
  → Optional: Cohere reranking
  → Confidence threshold applied (high >0.80, moderate 0.65–0.80, low <0.65)
  → Results returned to LLM with confidenceTier + confidenceNote
    ↓
LLM generates cited response
    ↓
Optional: async faithfulness check (gpt-4o-mini, non-blocking)
    ↓
Response streams to client
    ↓
Messages encrypted (AES-256-GCM) before persistence to database
```

### Search Tools (4 registered)

| Tool | Module | Purpose |
|---|---|---|
| `searchKnowledgeBase` | `search-knowledge-base.ts` | General search across all categories |
| `searchLegislation` | `knowledge-search-tools.ts` | Pre-filtered to `category = 'legislation'` |
| `searchGuidelines` | `knowledge-search-tools.ts` | Pre-filtered to `category = 'guideline'` |
| `searchTherapeuticContent` | `knowledge-search-tools.ts` | Pre-filtered to `category = 'therapeutic_content'` |

All tools share `executeHybridSearch` in `knowledge-search-tools.ts`.

### Confidence Tiers

| Tier | Similarity Range | LLM Behaviour |
|---|---|---|
| High | > 0.80 | Respond freely with full citations |
| Moderate | 0.65 – 0.80 | Respond with epistemic hedging |
| Low | < 0.65 | Disclose gap, suggest supervisor referral |

---

## Session Transcription Pipeline

```
Browser (MediaRecorder or file upload)
    ↓
Upload to Supabase Storage (session-audio bucket, private)
  → Audio encrypted (AES-256-GCM) before upload — stored as ciphertext blob
  → contentType must be the original audio MIME type (e.g. audio/webm), not application/octet-stream,
    because the Supabase bucket restricts allowed MIME types to audio formats
    ↓
POST /api/transcription/process (fire-and-forget from client; server blocks with maxDuration: 300)
  → Writes real phase transitions to DB: preparing → transcribing → saving → completed
  → Client polls GET /api/sessions/{id} every 5s to observe phase changes
  → Audio decrypted in memory before sending to transcription provider
    ↓
Upload to AssemblyAI via custom uploadAudio() helper (bypasses SDK upload)
  → The AssemblyAI Node SDK hardcodes Content-Type: application/octet-stream when uploading,
    which causes their transcoder to misidentify Chrome's WebM audio as video/webm.
    The uploadAudio() helper in assemblyai.ts sends Content-Type: audio/webm directly.
  → AssemblyAI EU endpoint (transcription + speaker diarisation in one call, ~$0.0028/min)
  → Fallback: Whisper API (batch transcription) → Claude diarisation (speaker labelling)
    ↓
Segments encrypted (per-segment keys) → stored in session_segments table
    ↓
POST /api/notes/generate
  → Segments decrypted for LLM context assembly
    ↓
LLM generates structured clinical notes (SOAP, DAP, BIRP, GIRP, Narrative formats)
    ↓
Notes encrypted (AES-256-GCM) → stored in clinical_notes table (draft → reviewed → finalised lifecycle)
```

Two recording modes: `full_session` (multi-speaker) and `therapist_summary` (single-speaker narrated summary).

### Clinical Note Formats

Five note formats, each with full-session and therapist-summary prompt variants. Format specifications authored by Aaron (clinical lead) in `.claude/note-taking-prompts.md`.

| Format | Sections | Use Case |
|---|---|---|
| **SOAP** | Subjective (CC, HPI/OLDCARTS, HEADSS), Objective, Assessment (problem list, differential), Plan | Most widely used clinical format |
| **DAP** | Data (events, interventions, homework review), Assessment (grounded in Data), Plan (goal-aligned) | Streamlined alternative to SOAP |
| **BIRP** | Behaviour (observable only), Intervention (clinical verbs), Response (verbal + non-verbal), Plan (client + clinician actions) | Behavioural focus, skills acquisition tracking |
| **GIRP** | Goals (treatment plan linked), Intervention (precise clinical terms), Response (progress evaluation), Plan (homework, future focus) | Goal-driven, "golden thread" to treatment plan |
| **Narrative** | Clinical Opening, Session Body (chronological), Clinical Synthesis & Risk, The Path Forward | Chronological narrative with thematic integration |

All formats are governed by universal clinical documentation standards (accuracy, defensibility, GDPR audience awareness, treatment alignment) prepended to every system prompt. Prompts are in `app/api/notes/generate/route.ts`. Parsers extract structured sections via regex with freeform fallback on parse failure.

---

## Clinical Documents System

Separate from session notes. Client-level documents spanning multiple sessions:

- Comprehensive Assessment, Case Formulation, Risk Assessment, Risk & Safety Plan, Treatment Plan, Supervision Notes, Discharge Summary
- Generated via `/api/documents/generate` using context assembly from client record + session history + existing notes + prior documents
- Format specs in `lib/documents/specs/*.md` (instructions to the LLM, not templates)
- Stored in `clinical_documents` table with draft → reviewed → finalised lifecycle and versioning via `supersedes_id`
- Document content encrypted at rest (AES-256-GCM) — decrypted in memory for context assembly and display

---

## Legal & Compliance

### Lawful Basis

- General processing: contract (Art 6(1)(b))
- Health data (special category): explicit consent (Art 9(2)(a))

### Sub-processors

| Provider | Purpose | Data Residency |
|---|---|---|
| Anthropic | AI chat (Claude) | EU |
| Cohere via AWS Bedrock | Embeddings | `eu-west-1` (Ireland) |
| OpenAI | Transcription fallback | EU |
| Supabase | Database, auth, storage | EU |
| Vercel | Hosting | EU |

No AI provider trains on user data.

### Legal Documents

Privacy policy and terms of service drafted as Word documents:
- Privacy policy: 30-day deletion window after account deletion request
- Terms: sole clinical responsibility on the therapist, require client data anonymisation, liability capped at 12 months' fees or £100

### Chat Retention

Indefinite retention with user-controlled deletion. Therapists can delete individual chats, delete all chats (via Data & Privacy settings), or delete their entire account. No automatic expiry.

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ENCRYPTION_MASTER_KEY` | Yes | 64-char hex string (32 bytes). Application-level encryption key for clinical data. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Loss of this key means permanent loss of all encrypted data. |
| `AI_GATEWAY_API_KEY` | Yes | Vercel AI Gateway key |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Yes | For embedding generation via Cohere Embed v4 on AWS Bedrock (`eu-west-1`). See `lib/ai/embedding.ts` |
| `ASSEMBLYAI_API_KEY` | Yes | For session transcription and speaker diarisation via AssemblyAI EU endpoint (Dublin). See `lib/transcription/providers/assemblyai.ts` |
| `OPENAI_API_KEY` | Yes | For contextual enrichment during ingestion (via AI Gateway). Also used if `TRANSCRIPTION_PROVIDER=whisper` fallback is active |
| `TRANSCRIPTION_PROVIDER` | No | `assemblyai` (default) or `whisper` — selects transcription backend |
| `DIARIZATION_PROVIDER` | No | `assemblyai` (default) or `claude` — selects diarisation backend |
| `ENABLE_TRANSCRIPTION` | No | Feature flag for transcription |
| `ENABLE_QUERY_REFORMULATION` | No | Multi-query retrieval (~$0.0003/search) |
| `COHERE_API_KEY` + `ENABLE_RERANKING` | No | Cross-encoder reranking |
| `DEV_LOGGING` | No | Dev-only RAG quality logging to disk |
| `ENABLE_FAITHFULNESS_CHECK` | No | Post-generation grounding verification |

---

## Common Commands

```bash
pnpm dev              # Start dev server (Next.js with Turbopack)
pnpm build            # Production build
pnpm lint             # Biome lint check (via ultracite)
pnpm format           # Biome auto-fix
pnpm test             # Playwright E2E tests
pnpm test:unit        # Vitest unit tests
pnpm db:push          # Apply migrations to local Supabase
pnpm db:types         # Regenerate TypeScript types from Supabase
pnpm ingest           # Run knowledge base ingestion
pnpm ingest --dry-run # Preview ingestion without writing to DB
pnpm ingest --with-context  # Include contextual enrichment (Anthropic API calls)
pnpm ingest --with-parents  # Include parent-child chunking
pnpm dev:logs         # CLI tool for reading/filtering RAG quality logs
npx tsx scripts/encrypt-all.ts   # Encrypt all existing plaintext data (idempotent, safe to re-run)
```

---

## Testing

### Two-tier E2E strategy

- **Tier 1 (CI):** Mocked UI tests — page rendering, navigation, form behaviour. Mock all API calls via `page.route()`. Run on every push.
- **Tier 2 (Local):** Integration tests — real chat flows, transcription, API responses. Gated behind `E2E_INTEGRATION=true`.

### Test structure

```
tests/
├── e2e/
│   ├── auth/           # Unauthenticated tests (login, register)
│   ├── app/            # Authenticated UI tests (dashboard, chat, sessions, clients)
│   └── integration/    # Full-stack integration tests
├── fixtures/
│   ├── index.ts        # Custom test fixture with mockApi
│   └── mock-data.ts    # Shared mock data
└── global-setup.ts     # Auth setup (saves session to storageState)
```

### Unit tests

- Located alongside source files in `__tests__/` directories (e.g., `lib/ai/__tests__/`, `lib/encryption/__tests__/`)
- Run with `pnpm test:unit` (Vitest)

---

## Current Status & Known Issues

### Implemented and Working

- Full RAG pipeline (database, ingestion script, hybrid search RPC, search tools, system prompt, confidence thresholds, no-results handling, sensitive content detection) — knowledge base has been ingested and content authoring is ongoing
- Modality-jurisdiction wiring (4-level resolution chain)
- Unified sidebar navigation shell (NavBar removed)
- Session transcription pipeline (record + upload → AssemblyAI EU endpoint for transcription + diarisation → clinical notes; Whisper + Claude fallback available). **Real phase-based progress tracking** — the process route writes real status transitions (`preparing` → `transcribing` → `saving` → `completed`) to the DB at each phase boundary. Client fires the process request without awaiting and polls `GET /api/sessions/{id}` every 5s. `useTranscriptionProgress` maps DB statuses to step-based progress (0–100%). No fake time-based animation. Statuses defined in `lib/db/types.ts` (`SESSION_TRANSCRIPTION_STATUSES`, `TRANSCRIPTION_STATUS_LABELS`). `useTranscriptionStatus` passes through real DB `TranscriptionStatus` values.
- Session summary recording mode (therapist-narrated summaries)
- **Clinical note formats** — 5 formats (SOAP, DAP, BIRP, GIRP, Narrative) with Aaron's detailed clinical specifications, universal documentation standards preamble, and full-session + therapist-summary prompt variants for each format. Source of truth: `.claude/note-taking-prompts.md`
- Clinical documents system (7 document types, generation API, context assembly, viewer + editor)
- **Settings area** at `app/(app)/settings/` with four sections:
  - `/settings/profile` — Professional Profile (jurisdiction, default modality, professional body). Feeds agent system prompt and search filtering.
  - `/settings/account` — Account & Security (account info, password change, session management placeholder)
  - `/settings/privacy` — Data & Privacy (data handling info, GDPR rights, data export, account deletion request, delete-all-chats with type-to-confirm, sub-processor table, legal document links)
  - `/settings/about` — Platform info, professional body references, data protection summary
  - Theme selection remains in the sidebar user nav dropdown — no dedicated settings page
  - Delete All Chats button removed from sidebar header; now lives on the Data & Privacy page with type-to-confirm safety flow
- Client hub with tabs (Overview, Chats, Sessions, Notes, Documents)
- Dev-only RAG quality logging system
- Query reformulation + parallel search + Cohere reranking (all optional, feature-flagged)
- Faithfulness checking (async, non-blocking)
- System prompt surgery (search-first mandate, terminology preservation, citation rules, no-results disclosure, confidence handling)
- Blank response bug fix (empty KB guard + fallback)
- **Application-level encryption** (AES-256-GCM) on all sensitive clinical content: session transcripts, clinical notes, clinical documents, chat messages, and audio files. Per-record key derivation via HKDF-SHA256. Migration scripts for existing plaintext data.
- **Privacy policy and terms of service** drafted as Word documents. Privacy policy states 30-day deletion window after account deletion request.
- **Chat retention policy:** indefinite retention with user-controlled deletion. Therapists can delete individual chats, delete all chats (via settings), or delete their entire account. No automatic expiry.

### Not Yet Implemented / On the Horizon

- **Confidence threshold integration into tool files** — `applyConfidenceThreshold` exists in `lib/ai/confidence.ts` but the wiring into `knowledge-search-tools.ts` and `search-knowledge-base.ts` may be incomplete. Verify the tool execute functions call it.
- **Contextual enrichment prompt update** — Add situational vocabulary generation to `scripts/lib/contextual-enrichment.ts` (addresses semantic gap between therapist language and KB terminology). Requires re-running ingestion with `--with-context`.
- **LLM provider evaluation** — Anthropic Claude API directly was recommended over Vercel AI Gateway for EU data residency and strong DPA terms.
- **Post-diarisation speaker confirmation UI** — Highest-impact improvement to diarisation accuracy. Proposed but not implemented.
- **Vercel artifact/document system** — Legacy from the template. Coexists with the purpose-built clinical notes and clinical documents systems but shares no data, UI, or database. Decision pending on whether to remove, repurpose, or keep.
- **Proposed pages implementation** — `proposed-pages-implementation-plan.md` contains 18 prompts for dashboard overhaul, client list enhancements, session detail improvements, sidebar enhancements, and template cleanup. Partially implemented (check individual pages for current state).
- **Playwright `mockApi` fixture issue** — An `unknown parameter` error was being diagnosed. Check `tests/fixtures/index.ts` for correct `test.extend()` generic type, and verify no test files import from `@playwright/test` directly instead of the custom fixture.
- **RAGAS evaluation framework** and golden test dataset — knowledge base now has content; evaluation can proceed when prioritised.
- **Encryption key rotation procedure** — The module supports rotation via `ENCRYPTION_MASTER_KEY_OLD` + re-encryption, but no automated rotation script exists yet. Build when needed.
- **`clients` table sensitive field encryption** — Fields like `presenting_issues`, `treatment_goals`, `risk_considerations`, and `background` contain clinical information but are not yet encrypted. Deferred to a second phase because these fields are read during context assembly for document generation.
- **PII detection** — Pre-submission flagging of personally identifiable information before it reaches the LLM.

### Outstanding Compliance Items

- **ICO registration** — Administrative task, ico.org.uk, ~£40/year
- **DPIA** (Data Protection Impact Assessment) — document (not a filing), should cover encryption architecture
- **Aaron review** of Data & Privacy page copy and privacy policy before production
- **Account deletion cascade pipeline** — Implementation plan exists (`account-deletion-cascade-pipeline.md`) for GDPR Article 17 (right to erasure). PROMPTs A, B, C in the plan. Architecture:
  - Server action inserts row into `account_deletion_requests` table and signs user out
  - Supabase Edge Function (triggered by pg_cron every 15 minutes) picks up pending requests and cascades deletion
  - Deletion order exploits verified FK CASCADE chains — only 4 explicit DELETEs needed:
    1. Audio files from Supabase Storage (`session-audio` bucket)
    2. `therapy_sessions` (cascades: session_segments, session_consents, clinical_notes)
    3. `"Chat"` (cascades: Message_v2, Stream, Vote_v2)
    4. `clients` (cascades: client_tag_assignments, clinical_documents → clinical_document_references)
    5. `therapist_profiles`
    6. `auth.admin.deleteUser()`
  - No table has ON DELETE CASCADE from `auth.users` — every user-owned table requires explicit deletion
  - Supabase free plan supports both Edge Functions and pg_cron — no upgrade required
  - The `account_deletion_requests` table has no FK to `auth.users` (intentional — audit record survives user deletion)

---

## Important Principles

1. **Blank response is the worst outcome.** In a clinical safety system, returning nothing is worse than returning an imperfect response. All code paths must produce a visible response.

2. **KB-grounded for high confidence, general knowledge with labelling for gaps.** Rigid KB-exclusive enforcement during MVP (with an empty KB) kills adoption. The agreed approach: use KB content when available at high confidence, fall back to general clinical knowledge with explicit labelling, hard refusal only for safety-critical edge cases.

3. **GDPR as competitive advantage.** Mental health data is special category data under Article 9. The privacy-by-design architecture (RAG processes anonymised therapist inputs, not raw client data) is the core differentiator. **Embedding data residency** — all embedding calls (query-time and ingestion) use Cohere Embed v4 on AWS Bedrock in `eu-west-1` (Ireland) via `@aws-sdk/client-bedrock-runtime`. No embedding data leaves EU infrastructure. Configuration is centralised in `lib/ai/embedding.ts`. **Transcription data residency** — all audio transcription and speaker diarisation uses AssemblyAI's EU endpoint (`api.eu.assemblyai.com`), processing data in Dublin (eu-west-1). No audio data leaves EU infrastructure. EU residency is controlled by the base URL in code — no dashboard configuration needed. AssemblyAI is SOC 2 Type 2, ISO 27001, and GDPR compliant. Configuration is in `lib/transcription/providers/assemblyai.ts`. **Encryption at rest** — all sensitive clinical content is encrypted at the application layer (AES-256-GCM) with keys managed separately from the database. Even a full database compromise yields only ciphertext.

4. **Legislation as practitioner briefings.** Raw statutory text is inappropriate. All legislation content is practitioner-oriented, organised around therapeutic scenarios, written in therapist-friendly language with inline statutory citations.

5. **Migration ordering matters.** PostgreSQL validates partial index predicates during `ALTER COLUMN TYPE`. Drop all referencing indexes BEFORE the `ALTER TABLE` statement.

6. **Prompt-driven development.** Complex features are broken into sequenced, self-contained prompts for coding AIs. Each prompt must reference actual file paths, function signatures, and line numbers from the real codebase — not specification documents.

7. **Codebase-first assessment.** Before producing plans or prompts, read the actual repository. Don't rely on specification documents or conversation history for current state.

8. **Master key is irreplaceable.** Loss of `ENCRYPTION_MASTER_KEY` means permanent, unrecoverable loss of all encrypted clinical data. The key must be backed up in a password manager and stored in Vercel environment variables. It must never be committed to the repository or logged.