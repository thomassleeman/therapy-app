/**
 * File-based log writer for the dev-only RAG quality logging system.
 *
 * Location: lib/dev/log-writer.ts
 *
 * Writes JSONL to {DEV_LOG_DIR}/sessions/{chatId}_{date}.jsonl
 * One JSON object per line, one line per turn.
 *
 * This module is intentionally isolated so it only touches the filesystem
 * and never imports Next.js or Supabase modules.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { TurnEntry } from "./types";

// ─── Configuration ───────────────────────────────────────────────────────────

function getLogDir(): string {
  return process.env.DEV_LOG_DIR ?? join(process.cwd(), "logs");
}

function getSessionsDir(): string {
  return join(getLogDir(), "sessions");
}

function getLogFilePath(chatId: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const safeId = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(getSessionsDir(), `${safeId}_${date}.jsonl`);
}

// ─── Directory initialisation ────────────────────────────────────────────────

let _dirsCreated = false;

async function ensureDirectories(): Promise<void> {
  if (_dirsCreated) return;
  await mkdir(getSessionsDir(), { recursive: true });
  _dirsCreated = true;
}

// ─── Writer ──────────────────────────────────────────────────────────────────

/**
 * Appends a TurnEntry as a single JSONL line.
 * Non-blocking — awaited only in the after() hook so it never adds latency.
 */
export async function writeTurnEntry(
  chatId: string,
  entry: TurnEntry
): Promise<void> {
  if (process.env.DEV_LOGGING !== "true") return;

  try {
    await ensureDirectories();
    const line = `${JSON.stringify(entry)}\n`;
    await appendFile(getLogFilePath(chatId), line, "utf8");

    if (process.env.DEV_LOG_CONSOLE === "true") {
      printConsoleSummary(entry);
    }
  } catch (err) {
    // Writing logs must never crash the server — fail silently
    console.warn("[dev-logger] Failed to write log entry:", err);
  }
}

// ─── Console summary ─────────────────────────────────────────────────────────

function printConsoleSummary(entry: TurnEntry): void {
  const toolSummary = entry.toolCalls
    .map((tc) => {
      const tier = tc.confidenceAssessment.tier;
      const count = tc.filteredResults.length;
      const totalMs = tc.timing.totalMs.toFixed(0);
      return `  ${tc.toolName}: tier=${tier}, results=${count}, ${totalMs}ms (embed=${tc.timing.embeddingMs.toFixed(0)}ms, search=${tc.timing.searchMs.toFixed(0)}ms)`;
    })
    .join("\n");

  const lines = [
    `[dev-logger] Turn ${entry.metadata.chatId.slice(0, 8)}… — ${entry.durationMs}ms total`,
    `  model: ${entry.metadata.selectedModel}`,
    `  sensitive: ${entry.sensitiveContent.detected ? entry.sensitiveContent.categories.join(", ") : "none"}`,
    entry.toolCalls.length > 0 ? `  tools:\n${toolSummary}` : "  tools: none",
    entry.qualitySignals
      ? `  grounding: ${(entry.qualitySignals.groundingIndicators.groundingScore * 100).toFixed(0)}% | gaps: ${entry.qualitySignals.contentGaps.length}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  console.log(lines);
}
