# Voting Functionality Report

**Date**: 2026-02-25
**Purpose**: Audit of voting feature — current implementation and removal impact analysis

---

## What the Feature Does

Allows therapists (users) to upvote or downvote individual **AI assistant messages** in a chat. Votes are per-message, mutually exclusive (up OR down OR neither), and persisted to the database. The UI renders thumb-up/thumb-down icon buttons on assistant messages only; user messages are not voteable. Optimistic updates are handled via SWR mutation.

---

## All Files Involved

### Database

| File | What it contains |
|---|---|
| `supabase/migrations/20240101000000_initial_schema.sql` | `Vote_v2` table DDL + RLS policies |

**Table definition:**
```sql
CREATE TABLE IF NOT EXISTS "Vote_v2" (
    "chatId" UUID NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
    "messageId" UUID NOT NULL REFERENCES "Message_v2"("id") ON DELETE CASCADE,
    "isUpvoted" BOOLEAN NOT NULL,
    PRIMARY KEY ("chatId", "messageId")
);
```

**RLS policies (in the same migration file):**
- Users can SELECT votes from chats they own or that are public
- Users can INSERT/UPDATE votes only on their own chats
- Users can DELETE votes only on their own chats

### Types

| File | What it contains |
|---|---|
| `lib/db/types.ts` | `Vote` and `VoteInsert` interfaces |

```typescript
export interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

export interface VoteInsert {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}
```

### Database Queries

| File | Functions |
|---|---|
| `lib/db/queries.ts` | `voteMessage()`, `getVotesByChatId()` |

- `voteMessage()` — upserts a vote row (creates or updates based on `chatId + messageId` composite key)
- `getVotesByChatId()` — fetches all votes for a given chat
- Vote deletion is also embedded in the `deleteTrailingMessages()` function: when messages are deleted, their associated votes are deleted first (manual cascade within the query, in addition to the DB-level cascade)

### API Route

| File | Endpoints |
|---|---|
| `app/(chat)/api/vote/route.ts` | `GET /api/vote`, `PATCH /api/vote` |

| Method | Input | Output | Notes |
|---|---|---|---|
| GET | `?chatId=<uuid>` (query param) | `Vote[]` | Requires auth; caller must own the chat |
| PATCH | `{ chatId, messageId, type: "up" \| "down" }` (JSON body) | `"Message voted"` | Upserts vote; requires auth + chat ownership |

### UI Components

| File | Role |
|---|---|
| `components/chat.tsx` | Fetches votes via SWR (`/api/vote?chatId=…`); passes `votes` down to `Messages` and `Artifact` |
| `components/messages.tsx` | Receives `votes: Vote[]`; finds the matching vote per message and passes it to `PreviewMessage` |
| `components/message.tsx` | Receives `vote: Vote \| undefined`; passes it to `MessageActions` |
| `components/message-actions.tsx` | Renders the upvote/downvote buttons; handles PATCH calls + SWR optimistic mutation |
| `components/artifact.tsx` | Receives `votes: Vote[]`; passes to `ArtifactMessages` |
| `components/artifact-messages.tsx` | Same pattern as `messages.tsx` — finds vote per message, passes to `PreviewMessage` |

### Error Handling

| File | What it contains |
|---|---|
| `lib/errors.ts` | `"vote"` is a registered Surface type with `visibility: "response"` |

---

## Data Flow

```
chat.tsx
  └─ SWR fetch → GET /api/vote?chatId=…
       └─ getVotesByChatId() → Vote_v2 table
  └─ votes[]
       ├─ messages.tsx
       │    └─ message.tsx (vote per message)
       │         └─ message-actions.tsx
       │              └─ PATCH /api/vote → voteMessage() → Vote_v2 upsert
       │              └─ SWR mutate (optimistic update)
       └─ artifact.tsx
            └─ artifact-messages.tsx
                 └─ message.tsx (same path)
```

---

## What Would Be Involved in Removing Voting

### 1. Database

- Drop the `Vote_v2` table and its RLS policies from the migration file, or write a new migration: `DROP TABLE "Vote_v2";`
- Remove the four RLS policy blocks for `Vote_v2` from the migration

### 2. `lib/db/types.ts`

- Delete the `Vote` and `VoteInsert` interfaces (lines ~147–151)

### 3. `lib/db/queries.ts`

- Delete `voteMessage()` function
- Delete `getVotesByChatId()` function
- Remove the vote deletion block inside `deleteTrailingMessages()` (the `supabase.from("Vote_v2").delete()…` call)

### 4. `app/(chat)/api/vote/route.ts`

- Delete the entire file

### 5. `lib/errors.ts`

- Remove `"vote"` from the Surface union type (one-line change)
- Remove any vote-specific error entries

### 6. `components/chat.tsx`

- Remove the `useSWR` call that fetches votes
- Remove the `votes` variable
- Remove the `votes` prop passed to `<Messages />` and `<Artifact />`

### 7. `components/messages.tsx`

- Remove `votes: Vote[] | undefined` from the component's props type
- Remove the `votes.find(…)` lookup
- Remove the `vote` prop passed to `<PreviewMessage />`

### 8. `components/message.tsx`

- Remove `vote: Vote | undefined` from the component's props type
- Remove the `vote` prop passed to `<MessageActions />`

### 9. `components/message-actions.tsx`

- Remove `vote: Vote | undefined` from props
- Remove the upvote button block
- Remove the downvote button block
- Remove the `ThumbUpIcon` / `ThumbDownIcon` imports
- Remove the SWR `mutate` import if it is only used for vote mutation

### 10. `components/artifact.tsx`

- Remove `votes: Vote[] | undefined` from props
- Remove the `votes` prop passed to `<ArtifactMessages />`

### 11. `components/artifact-messages.tsx`

- Same removals as `messages.tsx`

---

## Knock-On Effects / Risk Assessment

### Low risk / straightforward

- **No other feature depends on the vote data.** Votes are not used in any prompt construction, RAG pipeline, analytics, or access control. They are purely UI feedback.
- **TypeScript will surface every reference** — once `Vote` and `VoteInsert` are deleted from `types.ts`, the compiler will flag all remaining usages as errors, making the removal exhaustive and verifiable.
- **Database cascade is already correct** — `Vote_v2` cascades on `Chat` and `Message_v2` deletion, so removing the table has no orphan-data risk.

### Things to verify before removing

| Check | Why |
|---|---|
| Search for any Playwright tests referencing `message-upvote`, `message-downvote`, or `/api/vote` | E2E tests will fail if vote buttons/endpoints are removed without updating the tests |
| Check if `errors.ts` `"vote"` Surface is used in any catch blocks beyond `route.ts` | Removing it from the union without removing all usages will cause a TS error |
| Confirm `mutate` in `message-actions.tsx` has no other callers before removing the import | `mutate` from SWR is imported specifically for vote optimistic updates |
| Write and run a DB migration to drop `Vote_v2` | Without this, the table and its RLS policies remain in Supabase even after removing application code |

### No impact on

- Authentication / middleware
- Chat creation and message streaming
- Document / artifact functionality (beyond the prop thread, which gets cleaned up)
- RAG pipeline (not yet built, but votes were never part of the planned design)
- Suggestions feature
- Title generation
- Message editing

---

## Summary

Voting is a **self-contained, leaf-level feature** with no upstream dependencies. The prop chain runs deep (chat → messages → message → message-actions), but it is purely additive — removing it requires mechanical prop deletion at each layer rather than any architectural change. The database migration and TypeScript compiler together provide a complete checklist for a safe removal.
