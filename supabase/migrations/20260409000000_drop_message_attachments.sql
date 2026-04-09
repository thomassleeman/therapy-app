-- Drop the unused attachments column from Message_v2.
-- This column was template scaffolding from the Vercel AI chatbot starter
-- and was never populated with real data (always stored as empty JSON array).
ALTER TABLE "Message_v2" DROP COLUMN IF EXISTS attachments;
