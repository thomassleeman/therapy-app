CREATE TABLE IF NOT EXISTS public.faithfulness_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  overall_score numeric(3,2) NOT NULL,
  flagged boolean NOT NULL DEFAULT false,
  claims jsonb NOT NULL DEFAULT '[]',
  evaluation_latency_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_faithfulness_flagged ON public.faithfulness_checks (flagged) WHERE flagged = true;
CREATE INDEX idx_faithfulness_chat ON public.faithfulness_checks (chat_id);
