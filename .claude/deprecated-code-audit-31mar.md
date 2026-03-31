# Deprecated Code Audit — 31 March 2026

## Summary

Full codebase scan for deprecated methods, APIs, and patterns. The codebase is in **good shape** — no critical deprecations. The main concern is drift on AI SDK package versions.

---

## High Priority

### 1. AI SDK suite significantly outdated

The `ai` and `@ai-sdk/*` packages have drifted far behind latest:

| Package | Current | Latest | Gap |
|---|---|---|---|
| `ai` | 6.0.37 | 6.0.141 | ~104 releases |
| `@ai-sdk/react` | 3.0.39 | 3.0.143 | ~104 releases |
| `@ai-sdk/gateway` | 3.0.15 | 3.0.83 | ~68 releases |
| `@ai-sdk/anthropic` | 3.0.58 | 3.0.64 | 6 releases |
| `@ai-sdk/openai` | 3.0.30 | 3.0.49 | 19 releases |
| `@ai-sdk/cohere` | 3.0.22 | 3.0.27 | 5 releases |

**Risk:** Bug fixes, security patches, and potential breaking changes become harder to absorb the longer the gap grows.

**Action:** Update incrementally and test chat routes + streaming after each bump.

### 2. Legacy migration file should be deleted

- **File:** `lib/db/helpers/01-core-to-parts.ts`
- Contains commented-out code referencing AI SDK v4.3.13 with `@ts-expect-error` suppressions
- If the data migration is complete, this file serves no purpose

---

## Medium Priority

### 3. `unstable_serialize` from SWR

- **Files:** `components/chat.tsx`, `components/data-stream-handler.tsx`, `hooks/use-chat-client.ts`
- The `unstable_` prefix means this API may change without notice in future SWR releases
- No stable alternative exists yet — monitor SWR releases

### 4. Playwright outdated

- **Current:** 1.50.1 → **Latest:** 1.58.2 (8 releases behind)
- May contain browser automation fixes and new browser version support

### 5. Supabase SDK outdated

- **Current:** 2.93.3 → **Latest:** 2.101.0 (several patch releases)

### 6. `@vercel/functions` major version jump

- **Current:** 2.0.0 → **Latest:** 3.4.3
- Major version bump — review changelog for breaking changes before updating

---

## Low Priority

### 7. Deprecated internal type

- **File:** `lib/db/types.ts:469`
- `FreeformNoteContent` is marked `@deprecated` — alias for `NoteContent`
- Can be removed and references updated to `NoteContent` directly

### 8. Minor version bumps available

- `assemblyai`: 4.27.0 → 4.29.0
- `@biomejs/biome`: 2.3.11 → 2.4.10
- `sonner`: minor update available

---

## No Issues Found

| Area | Status |
|---|---|
| React 19 compatibility | No `defaultProps`, class components, string refs, or `ReactDOM.render` |
| `forwardRef` (24 UI components) | Still valid in React 19 |
| Next.js 16 patterns | Async `params`, `searchParams`, `cookies()`, `headers()` all correct |
| Node.js 22 APIs | No deprecated `Buffer()`, `url.parse()`, or crypto patterns |
| Supabase auth patterns | Using modern `getUser()` / `getClaims()` |
| Tailwind CSS v4 | Properly migrated with `@import "tailwindcss"` syntax |
| AWS SDK v3 (Bedrock) | Correctly implemented |
| Zod schemas | Current patterns, no deprecations |
| TypeScript config | Strict, modern, no deprecated options |
| `next.config.ts` | Using `remotePatterns` (not deprecated `domains`), `cacheComponents` valid |
| ProseMirror editor | Stable API, no deprecated patterns |
