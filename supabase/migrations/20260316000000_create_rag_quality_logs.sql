-- RAG quality logging table for tester feedback.
-- Stores full TurnEntry objects as JSONB, one row per chat turn.
-- Gated behind RAG_LOGGING=supabase env var (server-side only).

CREATE TABLE IF NOT EXISTS public.rag_quality_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  turn_data jsonb NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rag_quality_logs_chat ON public.rag_quality_logs (chat_id);
CREATE INDEX idx_rag_quality_logs_created ON public.rag_quality_logs (created_at);
