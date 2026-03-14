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

export async function migrateClinicalDocuments() {
  const supabase = getServiceClient();
  const table = "clinical_documents";

  let processed = 0;
  let migrated = 0;
  let skipped = 0;
  let lastCreatedAt: string | null = null;

  console.log(`[${table}] Starting migration...`);

  while (true) {
    let query = supabase
      .from(table)
      .select("id, content, created_at")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (lastCreatedAt) {
      query = query.gt("created_at", lastCreatedAt);
    }

    const { data: docs, error } = await query;

    if (error) {
      console.error(`[${table}] Query error:`, error.message);
      break;
    }

    if (!docs || docs.length === 0) {
      break;
    }

    for (const doc of docs) {
      processed++;

      if (!doc.content) {
        skipped++;
        continue;
      }

      if (isAlreadyEncrypted(doc.content)) {
        skipped++;
        continue;
      }

      try {
        const encrypted = await encryptJsonb(doc.content, doc.id);

        const { error: updateError } = await supabase
          .from(table)
          .update({ content: encrypted })
          .eq("id", doc.id);

        if (updateError) {
          console.error(
            `[${table}] Update error for document ${doc.id}:`,
            updateError.message,
          );
          continue;
        }

        migrated++;
      } catch (err) {
        console.error(
          `[${table}] Encryption error for document ${doc.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    lastCreatedAt = docs[docs.length - 1].created_at;
    logProgress(table, processed, migrated, skipped);
  }

  console.log(`[${table}] Complete — Processed: ${processed}, Migrated: ${migrated}, Skipped: ${skipped}`);
}

if (require.main === module) {
  migrateClinicalDocuments().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
