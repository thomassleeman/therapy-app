-- Migration: Initial Schema from Drizzle ORM
-- This migration creates all tables needed for the chat application
-- Note: We use auth.users for user authentication instead of a separate User table

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Chat table
CREATE TABLE IF NOT EXISTS "Chat" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "title" TEXT NOT NULL,
    "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "visibility" VARCHAR(10) NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('public', 'private'))
);

-- Message_v2 table (current version)
CREATE TABLE IF NOT EXISTS "Message_v2" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "chatId" UUID NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
    "role" VARCHAR(50) NOT NULL,
    "parts" JSONB NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Vote_v2 table (current version)
CREATE TABLE IF NOT EXISTS "Vote_v2" (
    "chatId" UUID NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
    "messageId" UUID NOT NULL REFERENCES "Message_v2"("id") ON DELETE CASCADE,
    "isUpvoted" BOOLEAN NOT NULL,
    PRIMARY KEY ("chatId", "messageId")
);

-- Document table with composite primary key for versioning
CREATE TABLE IF NOT EXISTS "Document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "title" TEXT NOT NULL,
    "content" TEXT,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'text' CHECK ("kind" IN ('text', 'code', 'image', 'sheet')),
    "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY ("id", "createdAt")
);

-- Suggestion table with composite foreign key to Document
CREATE TABLE IF NOT EXISTS "Suggestion" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "documentId" UUID NOT NULL,
    "documentCreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "originalText" TEXT NOT NULL,
    "suggestedText" TEXT NOT NULL,
    "description" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT FALSE,
    "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    FOREIGN KEY ("documentId", "documentCreatedAt") REFERENCES "Document"("id", "createdAt") ON DELETE CASCADE
);

-- Stream table for resumable streams
CREATE TABLE IF NOT EXISTS "Stream" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "chatId" UUID NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_chat_userId" ON "Chat"("userId");
CREATE INDEX IF NOT EXISTS "idx_chat_createdAt" ON "Chat"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_message_chatId" ON "Message_v2"("chatId");
CREATE INDEX IF NOT EXISTS "idx_message_createdAt" ON "Message_v2"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_document_userId" ON "Document"("userId");
CREATE INDEX IF NOT EXISTS "idx_document_id" ON "Document"("id");
CREATE INDEX IF NOT EXISTS "idx_suggestion_documentId" ON "Suggestion"("documentId");
CREATE INDEX IF NOT EXISTS "idx_stream_chatId" ON "Stream"("chatId");

-- Enable Row Level Security on all tables
ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Suggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stream" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Chat table
CREATE POLICY "Users can read own chats" ON "Chat"
    FOR SELECT
    USING ("userId" = auth.uid() OR "visibility" = 'public');

CREATE POLICY "Users can insert own chats" ON "Chat"
    FOR INSERT
    WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Users can update own chats" ON "Chat"
    FOR UPDATE
    USING ("userId" = auth.uid());

CREATE POLICY "Users can delete own chats" ON "Chat"
    FOR DELETE
    USING ("userId" = auth.uid());

-- RLS Policies for Message_v2 table
CREATE POLICY "Users can read messages from accessible chats" ON "Message_v2"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Message_v2"."chatId"
            AND ("Chat"."userId" = auth.uid() OR "Chat"."visibility" = 'public')
        )
    );

CREATE POLICY "Users can insert messages into own chats" ON "Message_v2"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Message_v2"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

CREATE POLICY "Users can update messages in own chats" ON "Message_v2"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Message_v2"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages from own chats" ON "Message_v2"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Message_v2"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

-- RLS Policies for Vote_v2 table
CREATE POLICY "Users can read votes from accessible chats" ON "Vote_v2"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Vote_v2"."chatId"
            AND ("Chat"."userId" = auth.uid() OR "Chat"."visibility" = 'public')
        )
    );

CREATE POLICY "Users can insert votes in own chats" ON "Vote_v2"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Vote_v2"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

CREATE POLICY "Users can update votes in own chats" ON "Vote_v2"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Vote_v2"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

CREATE POLICY "Users can delete votes from own chats" ON "Vote_v2"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Vote_v2"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

-- RLS Policies for Document table
CREATE POLICY "Users can read own documents" ON "Document"
    FOR SELECT
    USING ("userId" = auth.uid());

CREATE POLICY "Users can insert own documents" ON "Document"
    FOR INSERT
    WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Users can update own documents" ON "Document"
    FOR UPDATE
    USING ("userId" = auth.uid());

CREATE POLICY "Users can delete own documents" ON "Document"
    FOR DELETE
    USING ("userId" = auth.uid());

-- RLS Policies for Suggestion table
CREATE POLICY "Users can read own suggestions" ON "Suggestion"
    FOR SELECT
    USING ("userId" = auth.uid());

CREATE POLICY "Users can insert own suggestions" ON "Suggestion"
    FOR INSERT
    WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Users can update own suggestions" ON "Suggestion"
    FOR UPDATE
    USING ("userId" = auth.uid());

CREATE POLICY "Users can delete own suggestions" ON "Suggestion"
    FOR DELETE
    USING ("userId" = auth.uid());

-- RLS Policies for Stream table
CREATE POLICY "Users can read streams from own chats" ON "Stream"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Stream"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

CREATE POLICY "Users can insert streams into own chats" ON "Stream"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Stream"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

CREATE POLICY "Users can delete streams from own chats" ON "Stream"
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "Chat"."id" = "Stream"."chatId"
            AND "Chat"."userId" = auth.uid()
        )
    );

-- Database function for rate limiting (message count in time window)
CREATE OR REPLACE FUNCTION get_user_message_count(
    p_user_id UUID,
    p_hours_ago INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    message_count INTEGER;
BEGIN
    SELECT COUNT(m."id")::INTEGER INTO message_count
    FROM "Message_v2" m
    INNER JOIN "Chat" c ON m."chatId" = c."id"
    WHERE c."userId" = p_user_id
        AND m."createdAt" >= NOW() - (p_hours_ago * INTERVAL '1 hour')
        AND m."role" = 'user';

    RETURN COALESCE(message_count, 0);
END;
$$;
