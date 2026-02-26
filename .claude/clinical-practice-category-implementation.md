# Clinical Practice Category Implementation

## Overview

Added a fourth content category — `clinical_practice` — to the RAG knowledge base system. This category covers cross-modality professional practice content: note-taking, record management, treatment planning, and documentation standards.

**Date:** 2026-02-26

---

## Files Modified

### 1. `lib/types/knowledge.ts`
Added `"clinical_practice"` as the fourth element of `DOCUMENT_CATEGORIES`. The `DocumentCategory` type is derived from this array via `as const`, so it updated automatically everywhere that type is used.

### 2. `scripts/lib/chunker.ts`
Three changes:
- Extended `ChunkMetadata.strategy` union to include `"clinical_practice"`
- Added `chunkClinicalPractice()` function (section 4) — delegates to `chunkGuidelines()` and re-tags the `strategy` field. Clinical practice content has the same section-heading prose structure as guidelines so no new splitting logic was needed.
- Added `case "clinical_practice": return chunkClinicalPractice(text)` to the `chunkDocument` dispatcher switch (renumbered section comment from 4 to 5)

### 3. `scripts/lib/parent-child-chunker.ts`
Not in the original task spec, but required to satisfy the TypeScript exhaustive `never` check. Added a `"clinical_practice"` case to `getSplitterConfig()` using the same parameters as `"guideline"` (same prose structure). Without this, `npx tsc --noEmit` produced a type error at the `default: never` branch.

### 4. `supabase/migrations/20260226000000_add_clinical_practice_category.sql`
New migration file. Contains:
- `DROP CONSTRAINT / ADD CONSTRAINT` to update the `CHECK` on `knowledge_documents.category`
- `DROP CONSTRAINT / ADD CONSTRAINT` to update the `CHECK` on `knowledge_chunks.document_type`
- `CREATE INDEX IF NOT EXISTS idx_chunks_hnsw_clinical_practice` — partial HNSW index following the same pattern as the existing per-category indexes (`m=16`, `ef_construction=128`, `WHERE document_type = 'clinical_practice'`)
- `COMMENT ON FUNCTION public.hybrid_search` update (informational only — the RPC itself was not changed)

### 5. `lib/ai/tools/knowledge-search-tools.ts`
Three changes:
- Added `searchClinicalPractice` tool definition with `category: "clinical_practice"` pre-set, optional `jurisdiction` and `modality` parameters, and search weights `fullTextWeight: 1.0, semanticWeight: 1.1` (slightly semantic-leaning for varied documentation language)
- Added `searchClinicalPractice` to the `knowledgeSearchTools` factory return object
- Updated module-level JSDoc: "All three tools" → "All four tools"; updated `stepCountIs` example value from 5 to 6

### 6. `app/(chat)/api/chat/route.ts`
Two changes:
- Added `"searchClinicalPractice"` to both `experimental_activeTools` arrays (reasoning model array and non-reasoning model array)
- Bumped `stopWhen: stepCountIs(5)` → `stepCountIs(6)` and updated the comment to reflect five search tools now being available

### 7. `lib/ai/prompts.ts`
Two changes:
- Added a `parts.push(...)` call at the end of `getToolContextPrompt()` that always fires (regardless of modality/jurisdiction settings), directing the model to use `searchClinicalPractice` for documentation questions and to call it alongside other tools for cross-domain queries (e.g. consent + GDPR)
- Updated citation rule 2 to cover both `therapeutic_content` and `clinical_practice` — both use natural prose attribution rather than bracketed citations, since both are authored platform content rather than external references

### 8. `lib/ai/tools/search-knowledge-base.ts`
Two changes:
- Updated tool `description` to mention "clinical practice guidance" and "documentation practices"
- Updated the `category` parameter `.describe()` string to include `"clinical_practice"` with a brief explanation. The `z.enum(DOCUMENT_CATEGORIES)` already picks up the new value automatically from shared types.

### 9. `knowledge-base/clinical-practice/.gitkeep`
Created the directory `knowledge-base/clinical-practice/` at the project root with a `.gitkeep` file, following the pattern used by other knowledge base category directories.

---

## Design Decisions

### Why delegate to `chunkGuidelines`?
Clinical practice content (note-taking guides, treatment planning frameworks, documentation standards) is structured professional guidance — section headings, numbered procedures, inline references. This is identical to the prose structure of clinical guidelines. Creating a distinct chunking strategy would add complexity with no retrieval benefit; the category distinction exists for retrieval filtering, not chunking behaviour.

### Why `semanticWeight: 1.1` for `searchClinicalPractice`?
Therapists describe documentation needs in varied, conversational language ("how should I write up my sessions?"). Slightly favouring semantic search helps find "Structuring Progress Notes" from that kind of query. The weight is kept close to 1.0 so that specific terms like "SOAP", "Golden Thread", or "treatment plan" still rank well via full-text search.

### Why `stepCountIs(6)`?
Step 1 is the initial LLM generation. Steps 2–6 allow up to 5 sequential tool calls — one per search tool (`searchKnowledgeBase`, `searchLegislation`, `searchGuidelines`, `searchTherapeuticContent`, `searchClinicalPractice`). This keeps latency/cost proportional while enabling maximally complex cross-domain queries to be handled in a single turn.

### `parent-child-chunker.ts` was an unplanned but necessary change
The exhaustive `never` check in `getSplitterConfig()` meant the TypeScript compiler flagged an error once `DocumentCategory` grew to include `"clinical_practice"`. The fix reuses the guideline config (same reasoning as the main chunker delegation).

---

## Verification Performed

```
npx tsc --noEmit   # Passed clean — no type errors
pnpm lint          # Passed clean after auto-format fixed chunker.ts union type formatting
pnpm format        # Fixed one formatting issue (multi-line union in ChunkMetadata.strategy)
```

Grep checks confirmed `clinical_practice` appears in:
- `lib/types/knowledge.ts` (DOCUMENT_CATEGORIES)
- `scripts/lib/chunker.ts` (strategy union, function, dispatcher)
- `scripts/lib/parent-child-chunker.ts` (dispatcher)
- `supabase/migrations/20260226000000_add_clinical_practice_category.sql` (CHECK constraints, HNSW index)
- `lib/ai/tools/knowledge-search-tools.ts` (tool definition, factory)
- `lib/ai/tools/search-knowledge-base.ts` (description, category param)
- `lib/ai/prompts.ts` (tool context, citation rules)
- `app/(chat)/api/chat/route.ts` (activeTools arrays)
