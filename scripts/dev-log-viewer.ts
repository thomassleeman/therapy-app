#!/usr/bin/env tsx
/**
 * CLI tool for reading, filtering, and exporting RAG quality logs.
 *
 * Location: scripts/dev-log-viewer.ts
 * Run with: pnpm dev:logs <command> [options]
 *
 * Commands:
 *   list                          — list recent sessions
 *   show <chatId>                 — display all turns for a chat
 *   --filter "<field>=<value>"    — filter turns across all sessions
 *   --export <chatId>             — output session as a JSON array
 *   --summary [date]              — aggregate stats for a date (YYYY-MM-DD)
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  AggregateSummary,
  SessionSummary,
  TurnEntry,
} from "../lib/dev/types";

// ─── Configuration ───────────────────────────────────────────────────────────

const LOG_DIR = process.env.DEV_LOG_DIR ?? join(process.cwd(), "logs");
const SESSIONS_DIR = join(LOG_DIR, "sessions");

// ─── JSONL parsing ───────────────────────────────────────────────────────────

async function readTurns(filePath: string): Promise<TurnEntry[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TurnEntry);
}

async function listSessionFiles(): Promise<string[]> {
  try {
    const files = await readdir(SESSIONS_DIR);
    return files
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse() // newest first
      .map((f) => join(SESSIONS_DIR, f));
  } catch {
    return [];
  }
}

// ─── Command: list ───────────────────────────────────────────────────────────

async function cmdList(): Promise<void> {
  const files = await listSessionFiles();

  if (files.length === 0) {
    console.log("No log sessions found in", SESSIONS_DIR);
    return;
  }

  const summaries: SessionSummary[] = [];

  for (const filePath of files.slice(0, 20)) {
    const turns = await readTurns(filePath);
    if (turns.length === 0) continue;

    const chatId = turns[0].metadata.chatId;
    summaries.push({
      chatId,
      filePath,
      turnCount: turns.length,
      firstTimestamp: turns[0].metadata.timestamp,
      lastTimestamp: turns[turns.length - 1].metadata.timestamp,
    });
  }

  console.log(`\nRecent log sessions (${summaries.length} found):\n`);
  console.log(
    "CHAT ID".padEnd(38),
    "TURNS".padEnd(7),
    "FIRST TURN".padEnd(26),
    "LAST TURN"
  );
  console.log("─".repeat(100));

  for (const s of summaries) {
    console.log(
      s.chatId.padEnd(38),
      String(s.turnCount).padEnd(7),
      s.firstTimestamp.padEnd(26),
      s.lastTimestamp
    );
  }

  console.log();
}

// ─── Command: show ───────────────────────────────────────────────────────────

async function cmdShow(chatId: string): Promise<void> {
  const files = await listSessionFiles();
  const safeId = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const matching = files.filter((f) => basename(f).startsWith(`${safeId}_`));

  if (matching.length === 0) {
    console.error(`No log files found for chatId: ${chatId}`);
    process.exit(1);
  }

  const allTurns: TurnEntry[] = [];
  for (const f of matching) {
    allTurns.push(...(await readTurns(f)));
  }

  allTurns.sort(
    (a, b) =>
      new Date(a.metadata.timestamp).getTime() -
      new Date(b.metadata.timestamp).getTime()
  );

  for (const [i, turn] of allTurns.entries()) {
    console.log(`\n${"═".repeat(80)}`);
    console.log(
      `Turn ${i + 1} — ${turn.metadata.timestamp} — ${turn.durationMs}ms`
    );
    console.log(`Model: ${turn.metadata.selectedModel}`);
    console.log(
      `Modality: ${turn.metadata.effectiveModality ?? "none"} | Jurisdiction: ${turn.metadata.effectiveJurisdiction ?? "none"}`
    );

    console.log("\nUser message (first 200 chars):");
    console.log(`  "${turn.userMessage.slice(0, 200)}"`);

    if (turn.sensitiveContent.detected) {
      console.log(
        `\n⚠ Sensitive content: ${turn.sensitiveContent.categories.join(", ")}`
      );
    }

    if (turn.toolCalls.length > 0) {
      console.log(`\nTool calls (${turn.toolCalls.length}):`);
      for (const tc of turn.toolCalls) {
        console.log(`  ▸ ${tc.toolName}`);
        console.log(`    Input: ${JSON.stringify(tc.input).slice(0, 100)}`);
        console.log(
          `    Timing: embed=${tc.timing.embeddingMs}ms, search=${tc.timing.searchMs}ms, total=${tc.timing.totalMs}ms`
        );
        console.log(
          `    Confidence: ${tc.confidenceAssessment.tier} (max=${tc.confidenceAssessment.maxSimilarity.toFixed(3)}, avg=${tc.confidenceAssessment.averageSimilarity.toFixed(3)}, dropped=${tc.confidenceAssessment.droppedCount})`
        );
        console.log(
          `    Results: ${tc.filteredResults.length} returned (${tc.rawResults.length} raw)`
        );
        for (const r of tc.filteredResults) {
          console.log(
            `      - ${r.documentTitle} (score=${(r.similarityScore ?? 0).toFixed(3)})`
          );
        }
      }
    } else {
      console.log("\nNo tool calls.");
    }

    if (turn.qualitySignals) {
      const qs = turn.qualitySignals;
      console.log("\nQuality signals:");
      console.log(
        `  Grounding: ${(qs.groundingIndicators.groundingScore * 100).toFixed(0)}% (${qs.groundingIndicators.titlesReferencedInResponse.length}/${qs.groundingIndicators.retrievedTitles.length} titles referenced)`
      );
      console.log(
        `  Confidence: ${JSON.stringify(qs.overallConfidence.tiers)}`
      );
      if (qs.contentGaps.length > 0) {
        console.log(`  Content gaps (${qs.contentGaps.length}):`);
        for (const gap of qs.contentGaps) {
          console.log(`    - ${gap}`);
        }
      }
    }

    if (turn.response) {
      console.log("\nResponse (first 200 chars):");
      console.log(`  "${turn.response.text.slice(0, 200)}"`);
    }
  }

  console.log(`\n${"═".repeat(80)}\n`);
}

// ─── Command: --filter ───────────────────────────────────────────────────────

/**
 * Filter syntax: "field.path=value"
 * Supported comparisons: exact string, "true", "false", ">N", "<N"
 * E.g.: "qualitySignals.overallConfidence.anyLowConfidence=true"
 */
function evaluateFilter(turn: TurnEntry, filterExpr: string): boolean {
  const eqIndex = filterExpr.indexOf("=");
  if (eqIndex === -1) return false;

  const path = filterExpr.slice(0, eqIndex).trim();
  const rawValue = filterExpr.slice(eqIndex + 1).trim();

  // Navigate the object path
  const parts = path.split(".");
  let current: unknown = turn;
  for (const part of parts) {
    if (current === null || current === undefined) return false;
    current = (current as Record<string, unknown>)[part];
  }

  if (rawValue === "true") return current === true;
  if (rawValue === "false") return current === false;
  if (rawValue.startsWith(">") && typeof current === "number") {
    return current > Number(rawValue.slice(1));
  }
  if (rawValue.startsWith("<") && typeof current === "number") {
    return current < Number(rawValue.slice(1));
  }

  return String(current) === rawValue;
}

async function cmdFilter(filterExpr: string): Promise<void> {
  const files = await listSessionFiles();
  const matched: { turn: TurnEntry; file: string }[] = [];

  for (const file of files) {
    const turns = await readTurns(file);
    for (const turn of turns) {
      if (evaluateFilter(turn, filterExpr)) {
        matched.push({ turn, file: basename(file) });
      }
    }
  }

  if (matched.length === 0) {
    console.log(`No turns match filter: ${filterExpr}`);
    return;
  }

  console.log(`\nFound ${matched.length} turn(s) matching "${filterExpr}":\n`);

  for (const { turn, file } of matched) {
    console.log(
      `  [${file}] ${turn.metadata.timestamp} chat=${turn.metadata.chatId.slice(0, 8)}… ` +
        `model=${turn.metadata.selectedModel} dur=${turn.durationMs}ms`
    );
    if (turn.qualitySignals) {
      console.log(
        `    gaps=${turn.qualitySignals.contentGaps.length} ` +
          `grounding=${(turn.qualitySignals.groundingIndicators.groundingScore * 100).toFixed(0)}%`
      );
    }
  }

  console.log();
}

// ─── Command: --export ───────────────────────────────────────────────────────

async function cmdExport(chatId: string): Promise<void> {
  const files = await listSessionFiles();
  const safeId = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const matching = files.filter((f) => basename(f).startsWith(`${safeId}_`));

  if (matching.length === 0) {
    console.error(`No log files found for chatId: ${chatId}`);
    process.exit(1);
  }

  const allTurns: TurnEntry[] = [];
  for (const f of matching) {
    allTurns.push(...(await readTurns(f)));
  }

  allTurns.sort(
    (a, b) =>
      new Date(a.metadata.timestamp).getTime() -
      new Date(b.metadata.timestamp).getTime()
  );

  // Output as a pretty-printed JSON array suitable for pasting into an AI
  console.log(JSON.stringify(allTurns, null, 2));
}

// ─── Command: --summary ──────────────────────────────────────────────────────

async function cmdSummary(date?: string): Promise<void> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const files = await listSessionFiles();
  const dateFiles = files.filter((f) =>
    basename(f).endsWith(`_${targetDate}.jsonl`)
  );

  if (dateFiles.length === 0) {
    console.log(`No log sessions found for date: ${targetDate}`);
    return;
  }

  const allTurns: TurnEntry[] = [];
  for (const f of dateFiles) {
    allTurns.push(...(await readTurns(f)));
  }

  if (allTurns.length === 0) {
    console.log("No turns found.");
    return;
  }

  const totalTurns = allTurns.length;
  const avgDurationMs =
    allTurns.reduce((s, t) => s + t.durationMs, 0) / totalTurns;

  // Tool call distribution
  const toolDist: Record<string, number> = {};
  for (const turn of allTurns) {
    for (const tc of turn.toolCalls) {
      toolDist[tc.toolName] = (toolDist[tc.toolName] ?? 0) + 1;
    }
  }

  // Confidence tier distribution
  const tierDist: Record<string, number> = {};
  for (const turn of allTurns) {
    for (const tc of turn.toolCalls) {
      const tier = tc.confidenceAssessment.tier;
      tierDist[tier] = (tierDist[tier] ?? 0) + 1;
    }
  }

  // Common content gaps
  const gapCounts: Record<string, number> = {};
  for (const turn of allTurns) {
    if (!turn.qualitySignals) continue;
    for (const gap of turn.qualitySignals.contentGaps) {
      gapCounts[gap] = (gapCounts[gap] ?? 0) + 1;
    }
  }

  const commonContentGaps = Object.entries(gapCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([gap, count]) => `${gap} (×${count})`);

  // Average grounding score
  const groundingScores = allTurns
    .map((t) => t.qualitySignals?.groundingIndicators.groundingScore)
    .filter((s): s is number => s !== undefined);

  const avgGroundingScore =
    groundingScores.length > 0
      ? groundingScores.reduce((s, v) => s + v, 0) / groundingScores.length
      : 0;

  const summary: AggregateSummary = {
    date: targetDate,
    totalTurns,
    avgDurationMs: Math.round(avgDurationMs),
    toolCallDistribution: toolDist,
    confidenceTierDistribution: tierDist,
    commonContentGaps,
    avgGroundingScore,
  };

  console.log(`\nRAG Quality Summary — ${targetDate}\n`);
  console.log(`Total turns:        ${summary.totalTurns}`);
  console.log(`Avg turn duration:  ${summary.avgDurationMs}ms`);
  console.log(
    `Avg grounding:      ${(summary.avgGroundingScore * 100).toFixed(1)}%`
  );

  console.log("\nTool call distribution:");
  for (const [tool, count] of Object.entries(toolDist).sort(
    ([, a], [, b]) => b - a
  )) {
    console.log(`  ${tool.padEnd(32)} ${count}`);
  }

  console.log("\nConfidence tier distribution:");
  for (const [tier, count] of Object.entries(tierDist).sort(
    ([, a], [, b]) => b - a
  )) {
    console.log(`  ${tier.padEnd(12)} ${count}`);
  }

  if (commonContentGaps.length > 0) {
    console.log("\nCommon content gaps (potential KB gaps):");
    for (const gap of commonContentGaps) {
      console.log(`  ${gap}`);
    }
  }

  console.log();
}

// ─── CLI entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "list") {
    await cmdList();
    return;
  }

  if (args[0] === "show" && args[1]) {
    await cmdShow(args[1]);
    return;
  }

  if (args[0] === "--filter" && args[1]) {
    await cmdFilter(args[1]);
    return;
  }

  if (args[0] === "--export" && args[1]) {
    await cmdExport(args[1]);
    return;
  }

  if (args[0] === "--summary") {
    await cmdSummary(args[1]);
    return;
  }

  console.log(`
Usage: pnpm dev:logs <command>

Commands:
  list                             List recent log sessions
  show <chatId>                    Display all turns for a chat
  --filter "<field.path>=<value>"  Filter turns across all sessions
                                   E.g.: --filter "qualitySignals.overallConfidence.anyLowConfidence=true"
                                         --filter "metadata.effectiveModality=cbt"
  --export <chatId>                Output session as a JSON array (for AI analysis)
  --summary [YYYY-MM-DD]           Aggregate stats for a date (defaults to today)
`);
}

main().catch((err) => {
  console.error("dev:logs error:", err);
  process.exit(1);
});
