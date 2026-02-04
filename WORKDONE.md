# Work Done: Therapy Reflection Prompts

## Summary

Transformed the generic AI chatbot into a therapy-specific reflection tool by updating system prompts, adding therapeutic orientation support, and removing irrelevant features.

---

## Changes

### 1. `lib/ai/prompts.ts`

**New `therapyReflectionPrompt`** — Core system prompt defining the AI as a reflective practice companion:
- Reflective stance (questions over interpretations)
- Professional boundaries (no diagnoses, encourages supervision)
- Privacy safeguards (no identifiable client data)
- Warm but boundaried response style

**`TherapeuticOrientation` type** — Six supported frameworks:
- integrative, person-centred, CBT, psychodynamic, systemic, existential

**`orientationDescriptions`** — Framework-specific guidance injected when a non-integrative orientation is selected.

**Updated `artifactsPrompt`** — Reframed for therapy reflection notes rather than generic document creation.

**Updated `titlePrompt`** — Therapy-relevant examples, explicit client anonymity rule.

**Updated `systemPrompt()`** — Now accepts optional `therapeuticOrientation` parameter.

---

### 2. `app/(chat)/api/chat/schema.ts`

Added `therapeuticOrientationSchema` and optional `therapeuticOrientation` field to the request body, enabling per-chat orientation selection.

---

### 3. `app/(chat)/api/chat/route.ts`

- Imported `TherapeuticOrientation` type
- Removed `getWeather` tool (not relevant for therapy app)
- Extracted `therapeuticOrientation` from request body
- Passed orientation to `systemPrompt()`
- Removed `getWeather` from `experimental_activeTools` and `tools`

---

---

## Bug Fix: Document Content Not Displaying in UI

### Problem

When the AI agent created notes/documents, the content was being saved correctly to the database but not displaying in the UI. Users could see the document title but the content area remained empty.

### Root Cause Analysis

After extensive code review, three issues were identified:

1. **Editor content update logic** — The ProseMirror editor's useEffect used `if (content)` which fails for empty strings (falsy in JavaScript). When content arrived from the database fetch, edge cases prevented proper updates.

2. **Document version inconsistency** — `document-preview.tsx` used `documents?.[0]` (oldest version) while `artifact.tsx` used `documents.at(-1)` (newest). With multiple document versions, this could show stale/empty content.

3. **SWR cache not revalidating** — When opening an artifact, stale cached data could be served instead of fresh data from the database.

### Changes Made

#### 1. `components/text-editor.tsx` (lines 93-133)

**Before:**
```typescript
useEffect(() => {
  if (editorRef.current && content) {
    // ... update logic
  }
}, [content, status]);
```

**After:**
```typescript
useEffect(() => {
  if (!editorRef.current) {
    return;
  }

  // Always update if content is provided (including empty string for clearing)
  if (content !== undefined && content !== null) {
    const currentContent = buildContentFromDocument(
      editorRef.current.state.doc
    );

    // During streaming, always update to show progressive content
    if (status === "streaming") {
      // ... update logic
      return;
    }

    // When not streaming, update if content differs
    // Use length check first as a quick comparison, then full comparison
    if (currentContent.length !== content.length || currentContent !== content) {
      // ... update logic
    }
  }
}, [content, status]);
```

**Why:** The `&& content` check failed for empty strings. Changed to explicit `null`/`undefined` checks to ensure content updates work regardless of content value.

---

#### 2. `components/artifact.tsx` (lines 84-97, 120-124)

**SWR configuration change:**
```typescript
// Before
fetcher

// After
fetcher,
{
  revalidateOnFocus: false,
  revalidateOnMount: true,
}
```

**Revalidation useEffect change:**

**Before:**
```typescript
useEffect(() => {
  mutateDocuments();
}, [mutateDocuments]);
```

**After:**
```typescript
useEffect(() => {
  // Revalidate when artifact becomes visible with a valid document ID
  if (artifact.isVisible && artifact.documentId !== "init" && artifact.status !== "streaming") {
    mutateDocuments();
  }
}, [artifact.isVisible, artifact.documentId, artifact.status, mutateDocuments]);
```

**Why:** Ensures fresh data is fetched when artifact opens, and prevents unnecessary revalidation calls.

---

#### 3. `components/document-preview.tsx` (line 39)

**Before:**
```typescript
const previewDocument = useMemo(() => documents?.[0], [documents]);
```

**After:**
```typescript
const previewDocument = useMemo(() => documents?.at(-1), [documents]);
```

**Why:** Aligned with `artifact.tsx` to always use the latest document version. The API returns documents ordered by `createdAt` ascending, so `at(-1)` gets the most recent.

---

### Bug Still Present — Further Investigation (2026-02-04)

The above changes did not resolve the issue. Further investigation revealed the **actual root cause**:

#### Root Cause: Race Condition with `currentVersionIndex`

When documents load from the API, there's a render cycle where:

1. `currentVersionIndex` is still `-1` (initialized as `useState(-1)`)
2. `isCurrentVersion` evaluates to `false` because `-1 !== documents.length - 1`
3. Content is sourced from `getDocumentContentById(-1)` which returns `""` because `documents[-1]` is undefined in JavaScript
4. The useEffect then updates `currentVersionIndex` and `artifact.content`, but by then the Editor has already received empty content

The previous fixes addressed edge cases but not this core timing issue.

#### Additional Fixes Applied

**1. `components/artifact.tsx` — Handle uninitialized index (line 239-244)**

**Before:**
```typescript
const isCurrentVersion =
  documents && documents.length > 0
    ? currentVersionIndex === documents.length - 1
    : true;
```

**After:**
```typescript
// Handle -1 (uninitialized) as "current version" to avoid race condition
// when documents load but currentVersionIndex hasn't been set yet
const isCurrentVersion =
  documents && documents.length > 0
    ? currentVersionIndex === -1 || currentVersionIndex === documents.length - 1
    : true;
```

**Why:** Treats `-1` (uninitialized) as equivalent to "current version" so we use `artifact.content` instead of `getDocumentContentById(-1)`.

---

**2. `components/artifact.tsx` — Fallback to document content (line 465-468)**

**Before:**
```typescript
content={
  isCurrentVersion
    ? artifact.content
    : getDocumentContentById(currentVersionIndex)
}
```

**After:**
```typescript
content={
  isCurrentVersion
    ? artifact.content || documents?.at(-1)?.content || ""
    : getDocumentContentById(currentVersionIndex)
}
```

**Why:** When `artifact.content` is empty (hasn't been set by useEffect yet), fall back to reading directly from the fetched documents array.

---

## Next Steps

1. **Frontend selector** — Add UI for therapists to choose orientation when starting a chat
2. **Persist orientation** — Optionally store orientation in the `Chat` table
3. **RAG pipeline** — Wire up knowledge base retrieval to ground responses in therapeutic literature
