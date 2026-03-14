import { encryptJsonb } from "@/lib/encryption/fields";
import {
  BATCH_SIZE,
  getServiceClient,
  logProgress,
} from "./encryption-migrate-utils";

function isAlreadyEncrypted(content: unknown): boolean {
  return (
    typeof content === "object" &&
    content !== null &&
    "_encrypted" in content &&
    typeof (content as { _encrypted: unknown })._encrypted === "string"
  );
}

export async function migrateChatMessages() {
  const supabase = getServiceClient();
  const table = "Message_v2";

  let processed = 0;
  let migrated = 0;
  let skipped = 0;
  let lastCreatedAt: string | null = null;

  console.log(`[${table}] Starting migration...`);

  while (true) {
    // Message_v2 uses camelCase columns (legacy convention)
    let query = supabase
      .from(table)
      .select("id, content, createdAt")
      .order("createdAt", { ascending: true })
      .limit(BATCH_SIZE);

    if (lastCreatedAt) {
      query = query.gt("createdAt", lastCreatedAt);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error(`[${table}] Query error:`, error.message);
      break;
    }

    if (!messages || messages.length === 0) {
      break;
    }

    for (const message of messages) {
      processed++;

      if (!message.content) {
        skipped++;
        continue;
      }

      if (isAlreadyEncrypted(message.content)) {
        skipped++;
        continue;
      }

      try {
        const encrypted = await encryptJsonb(message.content, message.id);

        const { error: updateError } = await supabase
          .from(table)
          .update({ content: encrypted })
          .eq("id", message.id);

        if (updateError) {
          console.error(
            `[${table}] Update error for message ${message.id}:`,
            updateError.message,
          );
          continue;
        }

        migrated++;
      } catch (err) {
        console.error(
          `[${table}] Encryption error for message ${message.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    lastCreatedAt = (messages[messages.length - 1] as { createdAt: string }).createdAt;
    logProgress(table, processed, migrated, skipped);
  }

  console.log(`[${table}] Complete — Processed: ${processed}, Migrated: ${migrated}, Skipped: ${skipped}`);
}

if (require.main === module) {
  migrateChatMessages().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
