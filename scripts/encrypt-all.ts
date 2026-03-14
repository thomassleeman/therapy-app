import { migrateChatMessages } from "./encrypt-chat-messages";
import { migrateClinicalDocuments } from "./encrypt-clinical-documents";
import { migrateClinicalNotes } from "./encrypt-clinical-notes";
import { migrateSessionSegments } from "./encrypt-session-segments";

async function main() {
  console.log("=== Starting encryption migration ===\n");

  await migrateSessionSegments();
  console.log();
  await migrateClinicalNotes();
  console.log();
  await migrateClinicalDocuments();
  console.log();
  await migrateChatMessages();

  console.log("\n=== Encryption migration complete ===");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
