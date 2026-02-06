-- Add clientId to Chat table
ALTER TABLE "Chat" ADD COLUMN "clientId" UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Index for filtering chats by client
CREATE INDEX IF NOT EXISTS "idx_chat_clientId" ON "Chat"("clientId");
CREATE INDEX IF NOT EXISTS "idx_clients_therapist_id" ON public.clients("therapist_id");

-- RLS for clients table (enable if not already)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists can read own clients" ON public.clients
    FOR SELECT USING ("therapist_id" = auth.uid());

CREATE POLICY "Therapists can insert own clients" ON public.clients
    FOR INSERT WITH CHECK ("therapist_id" = auth.uid());

CREATE POLICY "Therapists can update own clients" ON public.clients
    FOR UPDATE USING ("therapist_id" = auth.uid());

CREATE POLICY "Therapists can delete own clients" ON public.clients
    FOR DELETE USING ("therapist_id" = auth.uid());
