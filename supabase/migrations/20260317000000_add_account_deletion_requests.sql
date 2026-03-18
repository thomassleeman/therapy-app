-- Account deletion requests table
-- No FK to auth.users — intentional: audit record must survive user deletion

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execute_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  audit_log JSONB DEFAULT '[]'
);

CREATE INDEX idx_deletion_requests_status
  ON account_deletion_requests(status)
  WHERE status = 'pending';

CREATE INDEX idx_deletion_requests_user
  ON account_deletion_requests(user_id);

-- RLS
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own deletion requests"
  ON account_deletion_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own deletion request"
  ON account_deletion_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can cancel own pending request"
  ON account_deletion_requests FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled');
