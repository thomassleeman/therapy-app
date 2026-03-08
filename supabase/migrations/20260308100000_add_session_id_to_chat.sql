-- Add session_id to Chat table to link chats to therapy sessions
ALTER TABLE "Chat" ADD COLUMN "sessionId" UUID REFERENCES public.therapy_sessions(id) ON DELETE SET NULL;

-- Index for looking up chats by session
CREATE INDEX IF NOT EXISTS "idx_chat_sessionId" ON "Chat"("sessionId");
