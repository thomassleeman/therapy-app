# Therapy Reflection Agent - Developer Guide

## What This Is

An AI-powered reflection tool for therapists. Therapists describe client sessions and receive evidence-based reflective questions and insights grounded in therapeutic frameworks via RAG. This is **not** a general chatbot — responses must stay within declared therapeutic frameworks and never provide direct diagnostic advice.

Built on the Vercel Next.js AI Chatbot template, modified to use Supabase (replacing the original Neon/Drizzle + NextAuth setup).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict, `strictNullChecks`) |
| Styling | Tailwind CSS 4, shadcn/ui |
| Auth | Supabase Auth (via `@supabase/ssr`) |
| Database | Supabase (PostgreSQL) |
| AI | Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, `@ai-sdk/gateway`) |
| LLM Models | Currently xAI via AI Gateway; swap target is OpenAI / Anthropic |
| Linting | Biome (via `ultracite`) |
| Package Manager | pnpm |
| Testing | Playwright (E2E) |
| Hosting | Vercel (target) |

---

## Project Layout

```
/
├── app/
│   ├── (auth-pages)/          # Sign-in, sign-up, password reset (unauthenticated)
│   ├── (chat)/                # Main chat experience (auth-required)
│   │   ├── api/               # API route handlers (chat, documents, history, votes, files)
│   │   ├── chat/[id]/         # Per-chat pages
│   │   ├── actions.ts         # Server actions (title gen, message deletion, visibility)
│   │   └── page.tsx           # Chat landing page
│   ├── auth/                  # Supabase auth callbacks
│   ├── layout.tsx             # Root layout
│   ├── actions.ts             # Root-level server actions
│   └── globals.css
├── components/
│   ├── ai-elements/           # AI SDK generative UI primitives (artifact, reasoning, etc.)
│   ├── elements/              # Wrapper/display versions of ai-elements
│   ├── ui/                    # shadcn/ui base components (do not lint/edit these)
│   ├── chat.tsx               # Core chat component
│   ├── messages.tsx           # Message list renderer
│   ├── multimodal-input.tsx   # Chat input with attachments
│   └── ...                    # Other feature components
├── hooks/                     # Client-side React hooks
├── lib/
│   ├── ai/
│   │   ├── models.ts          # Model registry and selection logic
│   │   ├── providers.ts       # AI SDK provider setup
│   │   ├── prompts.ts         # System/title prompts (KEY: therapy prompts go here)
│   │   ├── entitlements.ts    # Per-user model access rules
│   │   └── tools/             # AI tool definitions (weather, documents, suggestions)
│   ├── db/
│   │   ├── queries.ts         # All database query functions
│   │   └── types.ts           # TypeScript types mirroring DB schema
│   ├── auth.ts                # Supabase auth client helpers
│   ├── utils.ts               # Shared utilities
│   └── types.ts               # Shared app-level types
├── supabase/
│   ├── config.toml
│   └── migrations/            # SQL migrations (single initial schema currently)
├── middleware.ts              # Auth guard + route protection
├── next.config.ts
├── biome.jsonc                # Linter config
├── components.json            # shadcn/ui config
└── package.json
```

---

## Development Commands

```bash
pnpm dev              # Start dev server (Turbo mode)
pnpm build            # Production build
pnpm start            # Production server
pnpm lint             # Run Biome linter (ultracite check)
pnpm format           # Auto-fix lint/format (ultracite fix)
pnpm db:types         # Regenerate Supabase TypeScript types
pnpm db:push          # Push migrations to local Supabase
pnpm test             # Run Playwright E2E tests
```

---

## Environment Variables

No `.env` or `.env.example` is committed. Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=<supabase project url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase service role key>
AI_GATEWAY_API_KEY=<vercel AI gateway key>
```

> For non-Vercel local dev, `AI_GATEWAY_API_KEY` is required. On Vercel, the AI Gateway is automatically wired.

---

## Auth & Middleware

- Auth is handled by **Supabase Auth** with email/password (+ optional magic link / OAuth — see `app/(auth-pages)/`).
- `middleware.ts` protects all routes by default. Public routes (sign-in, sign-up, password reset, auth callbacks) are explicitly allowed.
- The Supabase client is set up for SSR via `@supabase/ssr`. See `lib/auth.ts` for client helpers.

---

## Database

- Single migration file: `supabase/migrations/20240101000000_initial_schema.sql`
- Types live in `lib/db/types.ts` (manually maintained, mirrors schema)
- Queries in `lib/db/queries.ts` — all DB access goes through here
- Core tables: `Chat`, `DBMessage`, `Vote`, `Document`, `Suggestion`, `Stream`

To add a table: write a new migration in `supabase/migrations/`, run `pnpm db:push`, then update types in `lib/db/types.ts`.

---

## AI Architecture

### Current Setup
- **AI SDK v6** drives all LLM interaction (`generateText`, `streamText`, `useChat`)
- **AI Gateway** (`@ai-sdk/gateway`) routes requests — currently configured for xAI (grok models)
- Models are registered in `lib/ai/models.ts`; swap providers in `lib/ai/providers.ts`
- System prompts and title generation prompts are in `lib/ai/prompts.ts`

### RAG (Not Yet Implemented)
RAG is the central differentiator for this product. When building the RAG pipeline:
1. Embeddings and vector search will likely use **Supabase pgvector** (already on Supabase)
2. Retrieved context should be injected into the system prompt before sending to the LLM
3. The retrieved chunks should inform which therapeutic framework constraints apply
4. `lib/ai/tools/` is where tool definitions live — RAG retrieval could be added as a tool here or as a pre-processing step before `streamText`

### Therapy-Specific Prompt Rules
Any system prompt or tool output for the therapy agent must:
- Stay within the therapist's declared therapeutic orientation
- Never provide direct diagnoses
- Encourage formal supervision for complex or risk-related cases
- Avoid storing or echoing back identifiable client information

---

## Code Style & Linting

- **Biome** with ultracite presets. Run `pnpm lint` to check, `pnpm format` to fix.
- 2-space indentation, spaces (not tabs)
- `components/ui/` and `lib/utils.ts` are excluded from linting (third-party / shadcn generated)
- Path alias: `@/` maps to project root (configured in `tsconfig.json`)
- Strict TypeScript with `strictNullChecks` enabled

---

## Privacy & Compliance (Non-Negotiable)

This product handles sensitive therapeutic content. All development decisions must account for:

- **GDPR compliance** — data residency, right to deletion, lawful basis for processing
- **No identifiable client data** should be persisted. Therapists are instructed to anonymize inputs; the system should not store or echo back names or identifying details
- **Encryption** at rest and in transit
- **Data retention** — chat history storage policy is an open decision (ephemeral vs. encrypted with retention limits)
- **Professional body standards** — BACP, UKCP, HCPC (UK)

When adding any storage, logging, or caching: default to the most privacy-restrictive option and require an explicit decision to loosen it.

---

## What's Already Done vs. What's Next

### Done
- Next.js + Supabase auth skeleton (sign-in, sign-up, password reset)
- Chat UI with streaming responses, artifacts, document editing, suggestions, votes
- AI SDK v6 integration with AI Gateway (xAI models)
- Basic DB schema (chats, messages, documents, suggestions)
- Middleware-based route protection
- Playwright test infrastructure

### Immediate Next Steps (MVP)
1. Define initial therapeutic framework(s) and write therapy-specific system prompts (`lib/ai/prompts.ts`)
2. Build RAG pipeline — ingest knowledge base, set up pgvector in Supabase, wire retrieval into chat
3. Add therapist profile/orientation selection (persisted in DB or user profile)
4. Privacy hardening — review what is stored, add anonymization guardrails, set retention policy
5. Stripe subscription integration
6. Strip or gate non-therapy features (weather tool, generic artifacts) behind the therapy workflow

### Out of Scope for MVP
- Audio/voice input
- Automated session notes
- Practice management integrations
- Anything not directly validating the core reflection use case

---

## Key Files to Touch First

| Task | File(s) |
|---|---|
| Change AI model or provider | `lib/ai/models.ts`, `lib/ai/providers.ts` |
| Edit system prompts | `lib/ai/prompts.ts` |
| Add a new AI tool | `lib/ai/tools/` |
| Add a DB table or query | `supabase/migrations/`, `lib/db/queries.ts`, `lib/db/types.ts` |
| Change auth flow | `app/(auth-pages)/`, `middleware.ts`, `lib/auth.ts` |
| Modify chat behavior | `app/(chat)/api/chat/route.ts`, `components/chat.tsx` |
| Add a new page/route | `app/` — follow existing route group pattern |
