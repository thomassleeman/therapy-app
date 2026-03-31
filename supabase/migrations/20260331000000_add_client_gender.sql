ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gender TEXT;

COMMENT ON COLUMN clients.gender IS 'Client gender. Common values: female, male, non_binary, not_recorded. Free text also accepted for self-describe. Nullable — absence means not yet asked/recorded.';
