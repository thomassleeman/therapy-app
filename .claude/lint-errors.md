# Lint Error Fixes — 2026-02-26

Summary of all changes made to resolve 121 Biome lint errors.

---

## Auto-fixed via `pnpm format` / `biome check --write --unsafe`

The following were fixed automatically and required no manual intervention:

- **Formatting** (`format` errors): Line-length wrapping in `app/(chat)/api/chat/route.ts`, `components/dashboard-page.tsx`, `components/message-actions.tsx`
- **Import organisation** (`organizeImports`): `app/(dashboard)/page.tsx`, `components/chat-header.tsx`, `components/nav-bar.tsx`
- **Block statements** (`useBlockStatements`): All single-line `if` bodies wrapped in braces across `lib/db/queries.ts`, `lib/ai/modality.ts`, `components/dashboard-page.tsx`, `components/search-tool-status.tsx`
- **Template literals** (`useTemplate`): String concatenation replaced with template literals in `lib/ai/contextual-response.ts` and `lib/ai/__tests__/sensitive-content.test.ts`
- **Collapsed `if`** (`useCollapsedIf`): Nested `if` inside `else if` merged into a single condition in `scripts/ingest-knowledge.ts`
- **Unused parameter prefix** (`noUnusedFunctionParameters`): `_user` parameter in `lib/auth.ts` already correctly prefixed; confirmed by auto-fix pass

---

## Manual fixes

### `components/artifact.tsx` — unused variable
- **Rule:** `lint/correctness/noUnusedVariables`
- **Change:** Removed `setArtifact` from the `useArtifact()` destructure on line 78. It was destructured but never referenced in the component.

---

### `utils/supabase/client.ts` — non-null assertions
- **Rule:** `lint/style/noNonNullAssertion`
- **Change:** Replaced `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!` with `?? ""` fallbacks. The `!` assertions were removed from the `createBrowserClient` call.

---

### `utils/supabase/middleware.ts` — non-null assertions + `forEach`
- **Rule:** `lint/style/noNonNullAssertion`, `lint/complexity/noForEach`, `lint/suspicious/useIterableCallbackReturn`
- **Changes:**
  - Replaced `!` non-null assertions on env vars with `?? ""` fallbacks.
  - Replaced two `cookiesToSet.forEach(...)` arrow-function calls (which implicitly returned values) with `for...of` loops:
    - `for (const { name, value } of cookiesToSet)` setting request cookies
    - `for (const { name, value, options } of cookiesToSet)` setting response cookies

---

### `utils/supabase/server.ts` — non-null assertions + `forEach`
- **Rule:** `lint/style/noNonNullAssertion`, `lint/complexity/noForEach`, `lint/suspicious/useIterableCallbackReturn`
- **Changes:**
  - Replaced `!` non-null assertions on env vars with `?? ""` fallbacks.
  - Replaced `cookiesToSet.forEach(...)` inside the `try` block with a `for...of` loop.

---

### `proxy.ts` — non-null assertions + `forEach`
- **Rule:** `lint/style/noNonNullAssertion`, `lint/complexity/noForEach`, `lint/suspicious/useIterableCallbackReturn`
- **Changes:**
  - Replaced `!` non-null assertions on env vars with `?? ""` fallbacks.
  - Replaced two `cookiesToSet.forEach(...)` calls with `for...of` loops (same pattern as `middleware.ts`).

---

### `scripts/ingest-knowledge.ts` — non-null assertions + collapsed if
- **Rule:** `lint/style/noNonNullAssertion`, `lint/style/useCollapsedIf`
- **Changes:**
  - Replaced `SUPABASE_URL!` and `SUPABASE_SERVICE_ROLE_KEY!` in `createSupabaseClient()` with `?? ""` fallbacks.
  - Removed `supabase!` non-null assertion in `processFile()`. Because the variable is typed `SupabaseAdmin | null`, a proper runtime guard was added (`if (!supabase) { throw new Error(...) }`) immediately before the `upsertDocument` call. This is safe because the dry-run path returns early above it, and `supabase` is only `null` when `flags.dryRun` is `true`.
  - Collapsed `else if (!OPENAI_API_KEY) { if (flags.withContext) { ... } }` into `else if (!OPENAI_API_KEY && flags.withContext) { ... }`.

---

### `lib/ai/tools/search-knowledge-base.ts` — unused function parameter
- **Rule:** `lint/correctness/noUnusedFunctionParameters`
- **Change:** Renamed the destructured `session` parameter to `_session` in the `searchKnowledgeBase` factory function signature. The parameter is part of the public API (`SearchKnowledgeBaseProps`) but not currently used inside the tool definition.

---

### `lib/ai/__tests__/sensitive-content.test.ts` — misplaced assertions
- **Rule:** `lint/suspicious/noMisplacedAssertion`
- **Change:** Added `// biome-ignore lint/suspicious/noMisplacedAssertion: helper called from within test callbacks` comments above each `expect()` call in the `expectCategories` and `expectNoDetection` helper functions. These helpers are intentionally designed to be called from inside `it()` blocks; Biome cannot infer this statically.

---

### `lib/hooks/useSupabaseAuth.ts` — filename convention
- **Rule:** `lint/style/useFilenamingConvention`
- **Change:** Renamed the file from `useSupabaseAuth.ts` to `use-supabase-auth.ts` to match the kebab-case convention used by all other hook files in the project (`use-artifact.ts`, `use-auto-resume.ts`, etc.).
- **Import updates:** Updated the import path in two components:
  - `components/nav-bar.tsx`
  - `components/sidebar-user-nav.tsx`
