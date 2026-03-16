/**
 * Supabase-backed log writer for the RAG quality logging system.
 *
 * Location: lib/dev/log-writer-supabase.ts
 *
 * Used when RAG_LOGGING=supabase (production/Vercel deployments).
 * Inserts the full TurnEntry as JSONB into the rag_quality_logs table.
 */

import "server-only";

import { createClient } from "@/utils/supabase/server";
import type { TurnEntry } from "./types";

export async function writeTurnEntryToSupabase(
  chatId: string,
  entry: TurnEntry,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("rag_quality_logs").insert({
      chat_id: chatId,
      turn_data: entry,
      schema_version: entry.schemaVersion,
    });

    if (error) {
      console.warn(
        "[rag-logger] Failed to write log to Supabase:",
        error.message,
      );
    }
  } catch (err) {
    console.warn("[rag-logger] Failed to write log entry:", err);
  }
}
