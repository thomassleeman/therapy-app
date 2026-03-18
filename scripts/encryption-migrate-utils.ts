import { createClient } from "@supabase/supabase-js";

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key);
}

export const BATCH_SIZE = 100;

export function logProgress(
  table: string,
  processed: number,
  migrated: number,
  skipped: number
) {
  console.log(
    `[${table}] Processed: ${processed}, Migrated: ${migrated}, Skipped (already encrypted): ${skipped}`
  );
}
