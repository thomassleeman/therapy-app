/**
 * Dispatcher that routes log writes to the appropriate backend.
 *
 * Location: lib/dev/log-writer-dispatch.ts
 *
 * RAG_LOGGING env var controls the backend:
 *   "local"    → filesystem JSONL (existing log-writer.ts)
 *   "supabase" → database (log-writer-supabase.ts)
 *
 * DEV_LOGGING=true is treated as equivalent to "local" for backward compat.
 *
 * Dynamic imports ensure node:fs is never loaded on Vercel and Supabase
 * is never loaded when unnecessary.
 */

import type { TurnEntry } from "./types";

type LoggingMode = "local" | "supabase" | false;

export function getLoggingMode(): LoggingMode {
  const ragLogging = process.env.RAG_LOGGING;

  if (ragLogging === "supabase") return "supabase";
  if (ragLogging === "local") return "local";

  // Backward compatibility
  if (process.env.DEV_LOGGING === "true") return "local";

  return false;
}

export async function dispatchWriteTurnEntry(
  chatId: string,
  entry: TurnEntry
): Promise<void> {
  const mode = getLoggingMode();

  if (mode === "local") {
    const { writeTurnEntry } = await import("./log-writer");
    await writeTurnEntry(chatId, entry);
  } else if (mode === "supabase") {
    const { writeTurnEntryToSupabase } = await import("./log-writer-supabase");
    await writeTurnEntryToSupabase(chatId, entry);
  }
}
