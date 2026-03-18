import { encrypt, isEncrypted } from "@/lib/encryption/crypto";
import {
  BATCH_SIZE,
  getServiceClient,
  logProgress,
} from "./encryption-migrate-utils";

export async function migrateSessionSegments() {
  const supabase = getServiceClient();
  const table = "session_segments";

  let processed = 0;
  let migrated = 0;
  let skipped = 0;
  let lastCreatedAt: string | null = null;

  console.log(`[${table}] Starting migration...`);

  while (true) {
    let query = supabase
      .from(table)
      .select("id, session_id, segment_index, content, created_at")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (lastCreatedAt) {
      query = query.gt("created_at", lastCreatedAt);
    }

    const { data: segments, error } = await query;

    if (error) {
      console.error(`[${table}] Query error:`, error.message);
      break;
    }

    if (!segments || segments.length === 0) {
      break;
    }

    for (const segment of segments) {
      processed++;

      if (!segment.content) {
        skipped++;
        continue;
      }

      if (isEncrypted(segment.content)) {
        skipped++;
        continue;
      }

      try {
        const derivationContext = `${segment.session_id}:segment:${segment.segment_index}`;
        const encrypted = await encrypt(segment.content, derivationContext);

        const { error: updateError } = await supabase
          .from(table)
          .update({ content: encrypted })
          .eq("id", segment.id);

        if (updateError) {
          console.error(
            `[${table}] Update error for segment ${segment.id}:`,
            updateError.message
          );
          continue;
        }

        migrated++;
      } catch (err) {
        console.error(
          `[${table}] Encryption error for segment ${segment.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    lastCreatedAt = segments[segments.length - 1].created_at;
    logProgress(table, processed, migrated, skipped);
  }

  console.log(
    `[${table}] Complete — Processed: ${processed}, Migrated: ${migrated}, Skipped: ${skipped}`
  );
}

if (require.main === module) {
  migrateSessionSegments().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
