# CLAUDE.md — Therapy Reflection App

> **Platform:** Therapy reflection app
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
| Transcription | AssemblyAI EU endpoint (`api.eu.assemblyai.com`, Dublin) — sole transcription provider (Whisper removed for GDPR non-compliance). Speech-to-text + speaker diarisation in a single call using `speech_models: ["universal-3-pro", "universal-2"]`. Provider abstraction in `lib/transcription/`. Audio MIME type persisted in `therapy_sessions.audio_mime_type` and passed through to AssemblyAI via `TranscribeOptions.mimeType`. |
| Encryption | AES-256-GCM with HKDF-SHA256 key derivation (Node.js `crypto`, zero dependencies) |
| UI | Tailwind CSS, shadcn/ui, Tiptap editor |
| Linting | Biome (via `ultracite` presets) |
| Testing | Playwright (E2E), Vitest (unit) |
| Package manager | pnpm |
| Node version | 22 (LTS) |

---

## AI Provider Integration

| Provider | Use case | Integration | File |
|---|---|---|---|
| Claude | Chat agent (ToolLoopAgent) | `@ai-sdk/anthropic` | `lib/ai/agents/therapy-reflection-agent.ts` |
| Claude | Note generation | `@ai-sdk/anthropic` `generateText` | `app/api/notes/generate/route.ts` |
| Claude | Note refinement | `@ai-sdk/anthropic` `streamText` | `app/api/notes/refine/route.ts` |
| Claude | Document generation | `@ai-sdk/anthropic` `generateText` | `app/api/documents/generate/route.ts` |
| Claude | Query reformulation | `@ai-sdk/anthropic` `generateObject` | `lib/ai/query-reformulation.ts` |
| Claude | Faithfulness check | `@ai-sdk/anthropic` `generateObject` | `lib/ai/faithfulness-check.ts` |
| Claude | Diarisation fallback | `@ai-sdk/anthropic` `generateObject` | `lib/transcription/providers/claude-diarization.ts` |
| Claude | Contextual enrichment (ingest, offline) | `@ai-sdk/anthropic` `generateText` | `scripts/lib/contextual-enrichment.ts` |
| AssemblyAI | Transcription + diarisation | Direct `assemblyai` SDK | `lib/transcription/providers/assemblyai.ts` |
| Cohere (Bedrock) | Embeddings | Direct `@aws-sdk/client-bedrock-runtime` | `lib/ai/embedding.ts` |
| Cohere | Reranking | `@ai-sdk/cohere` | `lib/ai/rerank.ts` |

**GDPR rationale for `@ai-sdk/anthropic`:** All runtime Claude calls use `@ai-sdk/anthropic` (the direct provider) rather than `@ai-sdk/gateway`. The Vercel AI Gateway routes through US-based infrastructure, adding an intermediary in the data path that we cannot place under Anthropic's EU data residency or DPA. Direct provider calls keep special-category health data on Anthropic's EU endpoint with no extra processor in between. New Claude integrations must use `@ai-sdk/anthropic`. See `.claude/anthropic-provider-migration.md` for the original migration. AssemblyAI and the Cohere/Bedrock embeddings path bypass the AI SDK entirely (AssemblyAI: the AI SDK doesn't cover transcription providers; Bedrock embeddings: known AI SDK bug — see `lib/ai/embedding.ts`).

---

## Project Structure

```
app/
├── global-error.tsx    # Root error boundary (catches root layout errors)
├── not-found.tsx       # Custom 404 page
├── (app)/              # All authenticated non-chat pages (unified sidebar layout)
│   ├── page.tsx                    # Dashboard
│   ├── clients/                    # Client list, client hub, clinical documents
│   ├── sessions/                   # Session list, new session, session detail
│   └── settings/                   # Settings area (profile, note-formats, account, privacy, about)
├── (auth-pages)/       # Sign-in, sign-up, password reset (no sidebar)
├── (chat)/             # Chat interface (own layout with DataStreamProvider)
│   ├── api/chat/                   # Chat route + stream resumption
│   ├── api/clients/                # Client CRUD API for chat context
│   └── chat/                       # Chat pages (new, [id])
├── api/                # Standalone API routes
│   ├── documents/                  # Clinical document generation + CRUD
│   ├── notes/generate/             # Clinical note generation from transcripts or written notes
│   ├── notes/refine/               # Streaming refinement chat for iterating on notes
│   ├── sessions/                   # Session CRUD + transcript retrieval
│   ├── settings/note-formats/      # Custom note format CRUD
│   └── transcription/              # Audio upload + processing pipeline
└── auth/               # OAuth callback routes

components/             # React components (client-side)
├── notes/              # Case formulation update nudge
├── sessions/           # Session detail sub-components (header, transcript, notes editor, refinement chat, actions bar, generate form, details tab)
├── transcription/      # Audio recorder, file upload
├── documents/          # Document generation form, viewer
├── ui/                 # shadcn/ui primitives
├── error-fallback.tsx  # Reusable error boundary UI (used by all route-level error.tsx files)
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
├── chat/               # Chat-specific context assembly (planned — see client-aware-chat-context-plan.md)
├── db/
│   ├── queries.ts      # All Supabase query functions
│   ├── types.ts        # TypeScript types for DB entities
│   └── faithfulness.ts # Faithfulness check persistence
├── dev/                # Dev-only RAG quality logging (behind DEV_LOGGING env var)
├── documents/          # Clinical documents system (types, context assembly via formatClientRecord/assembleClientRecord, specs/)
├── encryption/         # Application-level encryption (AES-256-GCM)
│   ├── crypto.ts       # Core primitives: encrypt, decrypt, encryptBuffer, decryptBuffer, isEncrypted
│   ├── fields.ts       # Field helpers: encryptField, decryptField, encryptJsonb, decryptJsonb, encryptSegments, decryptSegments
│   └── __tests__/      # Vitest test suites for crypto.ts and fields.ts
├── notes/              # Note format config (FORMAT_DESCRIPTIONS, EXAMPLE_PROMPTS)
├── transcription/      # Transcription abstraction layer (AssemblyAI only, with Claude diarisation fallback)
├── types/
│   └── knowledge.ts    # Single source of truth for RAG enums (categories, modalities, jurisdictions)
├── auth.ts             # Supabase auth wrapper
├── errors.ts           # Typed error classes (ChatSDKError — used by chat subsystem)
├── errors/
│   └── client-error-handler.ts  # Centralised client-side error handling (showErrorToast, extractErrorMessage, showSuccessToast)

scripts/
├── ingest-knowledge.ts # Knowledge base ingestion CLI (--dry-run, --with-context, --with-parents)
├── flatten-note-content.ts  # One-time migration: flatten structured note JSONB to { body: "..." }
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

- **Newer tables use `snake_case`** (`therapy_sessions`, `clinical_notes`, `therapist_profiles`, `knowledge_documents`, `custom_note_formats`)
- **Legacy tables use `PascalCase`** (`"Chat"`, `"Message_v2"`) — always quote these in SQL
- All queries go through `lib/db/queries.ts` using the Supabase client from `@/utils/supabase/server`
- Error handling via `handleSupabaseError(error, context)` helper
- "Not found" errors (code `PGRST116`) return `null` rather than throwing
- TypeScript types use camelCase, mapped from snake_case DB columns
- Clinical note content is always `{ body: string }` regardless of format — the `note_format` column records which format was used but does not affect the JSONB shape

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
- The system prompt is assembled in `lib/ai/prompts.ts` via `systemPrompt()` which composes: base prompt + orientation prompt + tool context prompt + sensitive content directives + session transcript context + client context (when implemented — see Client-Aware Chat Context below)
- **Zod schema constraint for Anthropic `generateObject`:** The Anthropic API does not support `minItems` values greater than 1 on array types in structured output schemas. Avoid `.length(n)`, `.min(n)` (where n > 1) on Zod arrays passed to `generateObject` — use `.max(n)` instead and rely on the prompt to request the desired count. This applies to all `generateObject` calls using Anthropic models (e.g. query reformulation in `lib/ai/query-reformulation.ts`).
- **`useChat` stale closure trap:** `useChat` (AI SDK v6) creates its internal `Chat` instance once on first render and stores it in a ref. The `DefaultChatTransport` and its `prepareSendMessagesRequest` closure are frozen from that first render. Any values that change after mount (e.g. state derived from async operations like note generation) will be stale in the closure. **Always use refs** for dynamic values passed in `prepareSendMessagesRequest` — see `noteTextRef` and `noteFormatRef` in `session-detail-client.tsx` for the pattern.

### Error Handling (Client-Side)

- **Centralised utility** at `lib/errors/client-error-handler.ts` provides three functions used by all non-chat client-side operations:
  - `showErrorToast(error, fallbackMessage)` — always shows the fallback message to the user (never raw `error.message`), logs the real error to console. Detects network failures (`TypeError` from `fetch()` + `navigator.onLine`) and shows a specific connectivity message instead of the generic fallback.
  - `extractErrorMessage(res, fallbackMessage)` — extracts a human-readable error from a non-ok `Response` body (expects `{ error: string }` JSON). Falls back to connectivity-specific messages when JSON parsing fails and the browser is offline, or to a server-unreachable message otherwise.
  - `showSuccessToast(message)` — convenience wrapper for success toasts.
- **Chat subsystem** uses its own error handling via `ChatSDKError` in `lib/errors.ts` and `fetchWithErrorHandlers` in `lib/utils.ts` — these are separate systems.
- **Toast API:** The custom wrapper at `components/toast.tsx` is the standard — `import { toast } from "@/components/toast"` with `toast({ type: "error" | "success", description: string })`. Some files still use direct `import { toast } from "sonner"` where `toast.promise()` is needed (sessions-table, sidebar-history, clients-page) since the custom wrapper doesn't support promise-based toasts.
- **Error boundaries:** Every route group has an `error.tsx` file backed by a shared `ErrorFallback` component. `global-error.tsx` catches root layout errors. `not-found.tsx` provides a custom 404.
- **Pattern for fetch handlers:**
  ```typescript
  try {
    const res = await fetch(...);
    if (!res.ok) {
      const message = await extractErrorMessage(res, "Friendly fallback.");
      toast({ type: "error", description: message });
      return;
    }
    // success path
  } catch (err) {
    showErrorToast(err, "Friendly fallback.");
  }
  ```
- **Network detection:** `showErrorToast` checks `navigator.onLine` and `TypeError` with fetch/network in the message. When detected, the toast reads: "Unable to connect. Please check your internet connection and try again." — this fires automatically for any handler using `showErrorToast`, no per-handler wiring needed.
- **Never expose raw error messages to users.** `showErrorToast` always uses the caller-provided fallback for the toast. Technical details go to `console.error` only.

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
| `session-audio` bucket | file data | Binary | Session UUID | *(transient — auto-deleted after transcription)* |

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
Client context assembly (when clientId present — see Client-Aware Chat Context section)
  → Tier 1: client record (always)
  → Tier 2: latest Case Formulation or Comprehensive Assessment (when available)
  → Tier 3: last 10 session notes (when available)
  → Session transcript (when session-linked chat)
    ↓
System prompt assembly (role + orientation + tool context + sensitive content + client context + session transcript)
    ↓
ToolLoopAgent runs (up to 6 steps)
  → LLM decides to call search tools
  → Tool generates 512-dim embedding via Cohere Embed v4 on AWS Bedrock eu-west-1 (see lib/ai/embedding.ts)
  → Optional: query reformulation (3 clinical variants via claude-haiku-4-5-20251001)
  → Optional: parallel search + RRF merge
  → hybrid_search RPC executes (vector similarity + full-text search, merged via RRF)
  → Optional: Cohere reranking
  → Confidence threshold applied (high >0.80, moderate 0.65–0.80, low <0.65)
  → Results returned to LLM with confidenceTier + confidenceNote
    ↓
LLM generates cited response
    ↓
Optional: async faithfulness check (claude-haiku-4-5-20251001, non-blocking)
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

## Client-Aware Chat Context

**Status:** Planned — implementation plan in `client-aware-chat-context-plan.md`

When a therapist selects a client in the chat header, the agent should have access to the client's full clinical picture. This uses a three-tier context injection strategy that avoids a hidden auto-maintained summary layer (which would risk compounding hallucinated errors in a clinical context). Instead, long-range context comes from therapist-reviewed clinical documents.

### Three-Tier Architecture

| Tier | What | Source | Size | When included |
|------|------|--------|------|---------------|
| 1 — Client record | Presenting issues, treatment goals, risk considerations, background, modality, status | `clients` table | ~200 words | Always (when client selected) |
| 2 — Summary document | Latest Case Formulation or Comprehensive Assessment | `clinical_documents` table | ~1000–2000 words | When a therapist-reviewed clinical document exists |
| 3 — Recent raw notes | Last 10 session notes in full (plain text with UPPERCASE headers) | `clinical_notes` table | ~3000–6000 words | Always (when notes exist) |

**Session-linked context:** When a chat is initiated from a session detail page ("Chat About This Session"), the specific session transcript is also injected (truncated to 8,000 characters if necessary), giving the agent both clinical history and the specific session the therapist wants to reflect on.

### Token Budget Safety Valve

For long-running therapeutic relationships (40+ sessions), raw notes could exceed the context budget. A progressive truncation strategy applies when the assembled context exceeds 30,000 characters (~7,500 tokens):

1. Reduce Tier 3 from N notes to N/2 (most recent half)
2. If still over: reduce to 3 most recent notes only
3. If still over: truncate each remaining note to 500 characters

Tier 1 and Tier 2 are never truncated — they are the most information-dense per character.

### Case Formulation Update Nudge

After a therapist finalises session notes, the UI nudges them to update their Case Formulation if it predates the session. This keeps the Tier 2 summary document current through therapist initiative, not system automation, ensuring every update goes through a clinical review gate. This also reinforces good clinical practice — case formulations are supposed to be living documents.

### GDPR Position

Client context injection is GDPR-compatible. The data is already stored on the platform under the therapist's existing lawful basis. Injecting it into the LLM context window for the same therapist's reflection chat does not create a new processing activity — the data flow to Anthropic is identical regardless of context window size.

### Key Files (planned)

| File | Purpose |
|------|---------|
| `lib/chat/context-assembly.ts` | Three-tier context assembly for chat route |
| `lib/ai/prompts.ts` | New `getClientContextPrompt()` function + "Client Context" system prompt section |
| `app/(chat)/api/chat/route.ts` | Integration point — calls context assembly, injects into system prompt |
| `components/notes/case-formulation-nudge.tsx` | Post-finalisation UI nudge |

---

## Session Transcription Pipeline

```
Browser (MediaRecorder or file upload)
  → Screen Wake Lock API keeps display on during recording (progressive enhancement)
  → Lock released on pause/stop/cancel/unmount, re-acquired on resume and tab visibility change
    ↓
Upload to Supabase Storage (session-audio bucket, private)
  → Audio encrypted (AES-256-GCM) before upload — stored as ciphertext blob
  → contentType must be the original audio MIME type (e.g. audio/webm), not application/octet-stream,
    because the Supabase bucket restricts allowed MIME types to audio formats
  → MIME type normalised in upload route (e.g. audio/x-wav → audio/wav, audio/x-m4a → audio/mp4)
    and persisted to `therapy_sessions.audio_mime_type` for use by the process route
    ↓
POST /api/transcription/process (fire-and-forget from client; server blocks with maxDuration: 300)
  → Writes real phase transitions to DB: preparing → transcribing → saving → completed
  → Client polls GET /api/sessions/{id} every 5s to observe phase changes
  → Audio decrypted in memory before sending to transcription provider
    ↓
Upload to AssemblyAI via custom uploadAudio() helper (bypasses SDK upload)
  → The AssemblyAI Node SDK hardcodes Content-Type: application/octet-stream when uploading,
    which causes their transcoder to misidentify Chrome's WebM audio as video/webm.
    The uploadAudio() helper in assemblyai.ts sends the correct Content-Type from
    `TranscribeOptions.mimeType` (read from `therapy_sessions.audio_mime_type`).
  → AssemblyAI EU endpoint (transcription + speaker diarisation in one call, ~$0.0028/min)
  → Fallback diarisation: Claude (text-based speaker labelling, same EU Anthropic endpoint as chat)
    ↓
Segments encrypted (per-segment keys) → stored in session_segments table
    ↓
Audio deleted from Supabase Storage + audioStoragePath nulled on therapy_sessions
  → Automatic cleanup on success path — audio serves no purpose after segments are saved
    ↓
POST /api/notes/generate
  → Segments decrypted for LLM context assembly
    ↓
LLM generates clinical notes (SOAP, DAP, BIRP, GIRP, Narrative, or custom formats)
    ↓
Notes encrypted (AES-256-GCM) → stored in clinical_notes table (draft → reviewed → finalised lifecycle)
```

Three session creation modes: `full_session` (multi-speaker audio recording), `therapist_summary` (single-speaker narrated summary), and `written_notes` (therapist types/pastes brief unformatted notes — no audio, no transcription, no consent required). Written notes sessions set `transcriptionStatus` to `'not_applicable'` and store the therapist's original text in the `written_notes` column on `therapy_sessions`. The note generation route uses this text as source material (with `SUMMARY_FORMAT_INSTRUCTIONS`) instead of fetching a transcript.

### Consent Collection

Consent is collected at step 2 of the `/sessions/new` wizard (before the record/upload step) for `full_session` and `therapist_summary` recording types. `written_notes` skips consent entirely.

**UI (`app/(app)/sessions/new/page.tsx`):** A single checkbox UI — informational items are displayed as a left-bordered list (not checkboxes), followed by one confirmation checkbox. Ticking it and clicking "Proceed to Recording" saves all granular consent records in a single `Promise.all` batch.

- `full_session`: saves 8 records — all 4 consent types (`recording`, `ai_transcription`, `ai_note_generation`, `data_storage`) × both parties (`therapist`, `client`). `consentMethod` is `'in_app_checkbox'` for therapist, `'verbal_recorded'` for client (therapist is confirming verbal consent was obtained).
- `therapist_summary`: saves 4 records — all 4 consent types × `therapist` only. `consentMethod` is `'in_app_checkbox'`.

**Server-side guard (`lib/db/queries.ts` → `hasRequiredConsents`):** Both `POST /api/transcription/upload` and `POST /api/transcription/process` call `hasRequiredConsents({ sessionId, recordingType })` and return 403 if any required consent record is missing or has been withdrawn. This is defence-in-depth against direct API calls bypassing the UI. `recordingType` **must** be passed — without it the function defaults to `full_session` criteria (which requires client consents) and will incorrectly reject `therapist_summary` sessions.

Required pairs checked:
- `therapist_summary`: all 4 types × therapist
- `full_session`: all 4 types × both parties

Consent records are stored in the `session_consents` table with a UNIQUE constraint on `(session_id, consent_type, consenting_party)`. `recordSessionConsent` uses upsert. Consent can be soft-withdrawn (sets `withdrawn_at`, preserves audit record). The session detail page displays all consent records in the Details tab via `getSessionConsents`.

### Clinical Note Formats

Five built-in note formats plus user-defined custom formats. All notes are stored as plain text with UPPERCASE section headers in a single JSONB field (`{ body: "full text" }`). No per-format TypeScript interfaces or regex parsing — the LLM output is stored directly.

Format specifications authored by Aaron (clinical lead) in `.claude/note-taking-prompts.md`. Each built-in format has full-session and therapist-summary/written-notes prompt variants.

| Format | Sections | Use Case |
|---|---|---|
| **SOAP** | Subjective (CC, HPI/OLDCARTS, HEADSS), Objective, Assessment (problem list, differential), Plan | Most widely used clinical format |
| **DAP** | Data (events, interventions, homework review), Assessment (grounded in Data), Plan (goal-aligned) | Streamlined alternative to SOAP |
| **BIRP** | Behaviour (observable only), Intervention (clinical verbs), Response (verbal + non-verbal), Plan (client + clinician actions) | Behavioural focus, skills acquisition tracking |
| **GIRP** | Goals (treatment plan linked), Intervention (precise clinical terms), Response (progress evaluation), Plan (homework, future focus) | Goal-driven, "golden thread" to treatment plan |
| **Narrative** | Clinical Opening, Session Body (chronological), Clinical Synthesis & Risk, The Path Forward | Chronological narrative with thematic integration |
| **Custom** | User-defined sections with therapist-authored descriptions | Therapist creates via `/settings/note-formats` |

**Storage model:** All note content (built-in and custom) is stored as `{ body: "SUBJECTIVE\nThe client described...\n\nOBJECTIVE\n..." }` — plain text with UPPERCASE headers. The `note_format` column records which format was used (`soap`, `dap`, `birp`, `girp`, `narrative`, or `custom:{uuid}`).

**Custom formats:** Stored in the `custom_note_formats` table (RLS-scoped to the owning therapist, max 10 per therapist). Each format defines sections (label + description + required flag) and optional general rules. At generation time, section descriptions are injected into the prompt. The `note_format` column stores `custom:{uuid}` referencing the format definition. Existing notes remain readable even if the format definition is later deleted — the content is self-contained plain text.

**Note editor:** A single textarea displaying the full note text. The therapist can edit freely, including modifying headers. No per-section split at display time.

**Refinement chat:** The `update_notes` tool performs full note replacement — the LLM returns the complete updated note text, not per-section diffs. The system prompt instructs the LLM to preserve sections the therapist did not ask to change.

**Structured generation output:** The note generation prompt requires the LLM to output its response in `<note>` and `<commentary>` XML tags. `parseGenerationOutput()` in `app/api/notes/generate/route.ts` extracts both parts — only the note content is stored in the database. If the LLM omits the XML tags, the parser falls back to using the entire output as the note (no commentary). The commentary (observations about gaps in the source material, assumptions made, areas to review) is returned alongside the clinical note in the API response and injected as the first assistant message in the refinement chat panel via `setMessages` in `session-detail-client.tsx`. If the LLM has no observations, the commentary is empty and the chat starts blank as normal.

**Client context in note generation:** Both the generate and refine routes inject the full client record into the system prompt via `formatClientRecord()` from `lib/documents/context-assembly.ts` — the same fields used by document generation (presenting issues, treatment goals, risk considerations, background, therapeutic modalities, status, therapy start date, session frequency, delivery method). Modality resolution prefers the client's `therapeuticModalities` over the therapist's `defaultModality` when available, so notes are framed around the correct therapeutic approach for that client.

All formats are governed by universal clinical documentation standards (accuracy, defensibility, GDPR audience awareness, treatment alignment) prepended to every system prompt. Prompts are in `app/api/notes/generate/route.ts`.

---

## Clinical Documents System

Separate from session notes. Client-level documents spanning multiple sessions:

- Comprehensive Assessment, Case Formulation, Risk Assessment, Risk & Safety Plan, Treatment Plan, Supervision Notes, Discharge Summary
- Generated via `/api/documents/generate` using context assembly from client record + session history + existing notes + prior documents
- Format specs in `lib/documents/specs/*.md` (instructions to the LLM, not templates)
- Stored in `clinical_documents` table with draft → reviewed → finalised lifecycle and versioning via `supersedes_id`
- Document content encrypted at rest (AES-256-GCM) — decrypted in memory for context assembly and display
- The Case Formulation and Comprehensive Assessment document types double as the Tier 2 summary for the planned client-aware chat context system — therapist-reviewed clinical summaries that give the chat agent long-range client context

---

## Legal & Compliance

### Lawful Basis

- General processing: contract (Art 6(1)(b))
- Health data (special category): explicit consent (Art 9(2)(a))

### Sub-processors

| Provider | Purpose | Data Residency |
|---|---|---|
| Anthropic | AI chat (Claude) | EU |
| AssemblyAI | Transcription + speaker diarisation | EU (Dublin) |
| Cohere via AWS Bedrock | Embeddings | `eu-west-1` (Ireland) |
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
| `OPENAI_API_KEY` | No | No longer used by runtime code. `scripts/ingest-knowledge.ts` still checks for it when `--with-context` is passed — that check is stale and can be removed. |
| `DIARIZATION_PROVIDER` | No | `assemblyai` (default) or `claude` — selects diarisation backend. `TRANSCRIPTION_PROVIDER` env var was removed (Whisper deleted for GDPR non-compliance; AssemblyAI is the sole provider). |
| `ENABLE_TRANSCRIPTION` | No | Feature flag for transcription |
| `ENABLE_QUERY_REFORMULATION` | No | Multi-query retrieval (~$0.0005/search via claude-haiku-4-5-20251001) |
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
- Session transcription pipeline (record + upload → AssemblyAI EU endpoint for transcription + diarisation → clinical notes). **Screen Wake Lock** — `useAudioRecorder` requests a Screen Wake Lock during active recording to prevent mobile screens from auto-locking and killing the MediaRecorder. Progressive enhancement (no-op if unsupported). Lock released on pause/stop/cancel/unmount, re-acquired on resume and `visibilitychange`. Recording UI shows an informational notice reminding therapists to keep the screen open. **Audio auto-deleted** from Supabase Storage after successful transcription (segments stored separately in Postgres); `audioStoragePath` nulled on `therapy_sessions`. Session DELETE route handles the case where audio is already gone. **Real phase-based progress tracking** — the process route writes real status transitions (`preparing` → `transcribing` → `saving` → `completed`) to the DB at each phase boundary. Client fires the process request without awaiting and polls `GET /api/sessions/{id}` every 5s. `useTranscriptionProgress` maps DB statuses to step-based progress (0–100%). No fake time-based animation. Statuses defined in `lib/db/types.ts` (`SESSION_TRANSCRIPTION_STATUSES` includes `'not_applicable'` for written notes, `TRANSCRIPTION_STATUS_LABELS`). `useTranscriptionStatus` passes through real DB `TranscriptionStatus` values.
- Session summary recording mode (therapist-narrated summaries)
- **Session consent collection** — single-checkbox consent UI at step 2 of `/sessions/new` for `full_session` and `therapist_summary` recording types. One confirmation checkbox saves all granular consent records in a batch (8 records for full session, 4 for therapist summary). Server-side `hasRequiredConsents` guard on both upload and process routes checks all 4 consent types × appropriate parties. `recordingType` must always be passed to `hasRequiredConsents` to avoid incorrectly applying full-session (two-party) criteria to therapist-summary sessions.
- **Written notes session creation path** — therapist types or pastes brief unformatted session notes on `/sessions/new`, AI expands into structured clinical notes. No audio recording, transcription, or consent flow. Uses `written_notes` recording type with `not_applicable` transcription status. Original text stored in `written_notes` column on `therapy_sessions`.
- **Clinical note formats** — 5 built-in formats (SOAP, DAP, BIRP, GIRP, Narrative) with Aaron's detailed clinical specifications, universal documentation standards preamble, and full-session + therapist-summary/written-notes prompt variants. Plus user-defined custom formats via `/settings/note-formats`. All notes stored as plain text with UPPERCASE section headers in `{ body: "..." }` JSONB — no per-format TypeScript interfaces or regex parsing. Single textarea editor. Refinement chat uses full-note replacement tool. Source of truth for built-in format specs: `.claude/note-taking-prompts.md`
- Clinical documents system (7 document types, generation API, context assembly, viewer + editor)
- **Settings area** at `app/(app)/settings/` with five sections:
  - `/settings/profile` — Professional Profile (jurisdiction, default modality, professional body). Feeds agent system prompt and search filtering.
  - `/settings/note-formats` — Custom Note Formats (create, edit, delete user-defined note formats with section definitions and general rules; max 10 per therapist)
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
- **Centralised client-side error handling** — all fetch-based operations across sessions, notes, documents, and client CRUD show user-friendly toast messages on failure via `lib/errors/client-error-handler.ts`. Network failures are auto-detected and show a specific connectivity message ("Unable to connect...") rather than the generic operation-failed message. Error boundaries (`error.tsx`) on all route groups catch unhandled rendering errors with a recovery UI. Custom 404 page. Toast API standardised on the custom `components/toast.tsx` wrapper (direct sonner imports remain only where `toast.promise()` is needed).
- **Privacy policy and terms of service** drafted as Word documents. Privacy policy states 30-day deletion window after account deletion request.
- **Chat retention policy:** indefinite retention with user-controlled deletion. Therapists can delete individual chats, delete all chats (via settings), or delete their entire account. No automatic expiry.

### Not Yet Implemented / On the Horizon

- **Client-aware chat context injection** — Three-tier context system for enriching chat agent responses with client-specific clinical data when a client is selected. Implementation plan in `client-aware-chat-context-plan.md` (7 prompts). Architecture: Tier 1 (client record — always), Tier 2 (latest Case Formulation or Comprehensive Assessment — therapist-reviewed summary), Tier 3 (last 10 session notes in full). Includes session-linked chat transcript injection, token budget safety valve (30,000 char limit with progressive truncation), and post-note-finalisation nudge to update Case Formulation. GDPR-compatible — no new processing activity, same data flow to Anthropic. Key files to create: `lib/chat/context-assembly.ts`, modifications to `app/(chat)/api/chat/route.ts` and `lib/ai/prompts.ts`. Requires Aaron review of the "Client Context" system prompt instructions before merging (Prompt 3).
- **Confidence threshold integration into tool files** — `applyConfidenceThreshold` exists in `lib/ai/confidence.ts` but the wiring into `knowledge-search-tools.ts` and `search-knowledge-base.ts` may be incomplete. Verify the tool execute functions call it.
- **Contextual enrichment prompt update** — Add situational vocabulary generation to `scripts/lib/contextual-enrichment.ts` (addresses semantic gap between therapist language and KB terminology). Requires re-running ingestion with `--with-context`.
- **`ingest-knowledge.ts` stale OPENAI_API_KEY check** — The `--with-context` flag still validates `OPENAI_API_KEY` at startup, but contextual enrichment now uses `@ai-sdk/anthropic` directly. Remove the check and replace with `ANTHROPIC_API_KEY` validation (which is already required by the main app anyway).
- **Post-diarisation speaker confirmation UI** — Highest-impact improvement to diarisation accuracy. Proposed but not implemented.
- **Vercel artifact/document system** — Legacy from the template. Coexists with the purpose-built clinical notes and clinical documents systems but shares no data, UI, or database. Decision pending on whether to remove, repurpose, or keep.
- **Proposed pages implementation** — `proposed-pages-implementation-plan.md` contains 18 prompts for dashboard overhaul, client list enhancements, session detail improvements, sidebar enhancements, and template cleanup. Partially implemented (check individual pages for current state).
- **Playwright `mockApi` fixture issue** — An `unknown parameter` error was being diagnosed. Check `tests/fixtures/index.ts` for correct `test.extend()` generic type, and verify no test files import from `@playwright/test` directly instead of the custom fixture.
- **RAGAS evaluation framework** and golden test dataset — knowledge base now has content; evaluation can proceed when prioritised.
- **Encryption key rotation procedure** — The module supports rotation via `ENCRYPTION_MASTER_KEY_OLD` + re-encryption, but no automated rotation script exists yet. Build when needed.
- **`clients` table sensitive field encryption** — Fields like `presenting_issues`, `treatment_goals`, `risk_considerations`, and `background` contain clinical information but are not yet encrypted. Deferred to a second phase because these fields are read during context assembly for both note generation and document generation.
- **PII detection** — Pre-submission flagging of personally identifiable information before it reaches the LLM.

### Outstanding Compliance Items

- **ICO registration** — Administrative task, ico.org.uk, ~£40/year
- **DPIA** (Data Protection Impact Assessment) — document (not a filing), should cover encryption architecture
- **Aaron review** of Data & Privacy page copy and privacy policy before production
- **Account deletion cascade pipeline** — Implementation plan exists (`account-deletion-cascade-pipeline.md`) for GDPR Article 17 (right to erasure). PROMPTs A, B, C in the plan. Architecture:
  - Server action inserts row into `account_deletion_requests` table and signs user out
  - Supabase Edge Function (triggered by pg_cron every 15 minutes) picks up pending requests and cascades deletion
  - Deletion order exploits verified FK CASCADE chains — only 4 explicit DELETEs needed:
    1. Audio files from Supabase Storage (`session-audio` bucket) — usually already deleted after transcription; this is a defensive sweep
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

3. **GDPR as competitive advantage.** Mental health data is special category data under Article 9. The privacy-by-design architecture (RAG processes anonymised therapist inputs, not raw client data) is the core differentiator. **Embedding data residency** — all embedding calls (query-time and ingestion) use Cohere Embed v4 on AWS Bedrock in `eu-west-1` (Ireland) via `@aws-sdk/client-bedrock-runtime`. No embedding data leaves EU infrastructure. Configuration is centralised in `lib/ai/embedding.ts`. **Transcription data residency** — all audio transcription and speaker diarisation uses AssemblyAI's EU endpoint (`api.eu.assemblyai.com`), processing data in Dublin (eu-west-1). No audio data leaves EU infrastructure. EU residency is controlled by the base URL in code — no dashboard configuration needed. AssemblyAI is SOC 2 Type 2, ISO 27001, and GDPR compliant. Configuration is in `lib/transcription/providers/assemblyai.ts`. OpenAI Whisper was previously available as a fallback provider but was removed because the Whisper API has no EU data residency option for audio processing, making it non-compliant for Article 9 special category health data. **Encryption at rest** — all sensitive clinical content is encrypted at the application layer (AES-256-GCM) with keys managed separately from the database. Even a full database compromise yields only ciphertext.

4. **Legislation as practitioner briefings.** Raw statutory text is inappropriate. All legislation content is practitioner-oriented, organised around therapeutic scenarios, written in therapist-friendly language with inline statutory citations.

5. **Migration ordering matters.** PostgreSQL validates partial index predicates during `ALTER COLUMN TYPE`. Drop all referencing indexes BEFORE the `ALTER TABLE` statement.

6. **Prompt-driven development.** Complex features are broken into sequenced, self-contained prompts for coding AIs. Each prompt must reference actual file paths, function signatures, and line numbers from the real codebase — not specification documents.

7. **Codebase-first assessment.** Before producing plans or prompts, read the actual repository. Don't rely on specification documents or conversation history for current state.

8. **Master key is irreplaceable.** Loss of `ENCRYPTION_MASTER_KEY` means permanent, unrecoverable loss of all encrypted clinical data. The key must be backed up in a password manager and stored in Vercel environment variables. It must never be committed to the repository or logged.

9. **No hidden clinical automation.** Clinical summary documents (Case Formulations, Assessments) must always be therapist-initiated and therapist-reviewed. The platform nudges updates but never auto-generates or silently modifies clinical documents — this prevents compounding errors in a context where hallucination has real clinical consequences.