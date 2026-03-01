/**
 * Core turn logger for the dev-only RAG quality logging system.
 *
 * Location: lib/dev/logger.ts
 *
 * Uses AsyncLocalStorage so tool functions can call
 * devLogger.currentTurn()?.logToolCall() without receiving the logger
 * as an explicit parameter.
 *
 * When process.env.DEV_LOGGING !== 'true', all methods are no-ops.
 * This is checked at call time so there is zero import overhead in production.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { writeTurnEntry } from "./log-writer";
import type {
  ConfidenceAssessmentEntry,
  FilteredResultEntry,
  RawSearchResultEntry,
  ToolCallEntry,
  ToolCallTiming,
  TurnEntry,
  TurnMetadata,
} from "./types";
import { LOG_SCHEMA_VERSION } from "./types";

// ─── Public interface ────────────────────────────────────────────────────────

export interface TurnLogger {
  /** Record the (truncated, non-identifying) user message text. */
  setUserMessage(text: string): void;
  /** Record the sensitive content detection result. */
  setSensitiveContent(detected: boolean, categories: string[]): void;
  /** Record a completed tool call with full timing and result data. */
  logToolCall(entry: ToolCallEntry): void;
  /** Record the final assistant response text and token counts. */
  setResponse(text: string, totalTokens?: number, finishReason?: string): void;
  /** Derive quality signals from the accumulated tool call + response data. */
  computeQualitySignals(): void;
  /** Write the completed TurnEntry to the JSONL log file. Call from after(). */
  flush(): Promise<void>;
}

export type {
  ToolCallEntry,
  ToolCallTiming,
  RawSearchResultEntry,
  FilteredResultEntry,
  ConfidenceAssessmentEntry,
};

// ─── No-op implementation (production / logging disabled) ────────────────────

class NoOpTurnLogger implements TurnLogger {
  setUserMessage(_text: string): void {}
  setSensitiveContent(_detected: boolean, _categories: string[]): void {}
  logToolCall(_entry: ToolCallEntry): void {}
  setResponse(
    _text: string,
    _totalTokens?: number,
    _finishReason?: string
  ): void {}
  computeQualitySignals(): void {}
  async flush(): Promise<void> {}
}

// ─── Active implementation (DEV_LOGGING=true) ────────────────────────────────

class ActiveTurnLogger implements TurnLogger {
  private readonly startTime: number;
  private readonly metadata: TurnMetadata;
  private userMessage = "";
  private sensitiveContent: TurnEntry["sensitiveContent"] = {
    detected: false,
    categories: [],
  };
  private readonly toolCalls: ToolCallEntry[] = [];
  private response: TurnEntry["response"] = null;
  private qualitySignals: TurnEntry["qualitySignals"] = null;

  constructor(metadata: TurnMetadata) {
    this.metadata = metadata;
    this.startTime = Date.now();
  }

  setUserMessage(text: string): void {
    this.userMessage = text.slice(0, 500);
  }

  setSensitiveContent(detected: boolean, categories: string[]): void {
    this.sensitiveContent = { detected, categories };
  }

  logToolCall(entry: ToolCallEntry): void {
    this.toolCalls.push(entry);
  }

  setResponse(text: string, totalTokens?: number, finishReason?: string): void {
    this.response = {
      text: text.slice(0, 500),
      ...(totalTokens !== undefined && { totalTokens }),
      ...(finishReason !== undefined && { finishReason }),
    };
  }

  computeQualitySignals(): void {
    const responseText = this.response?.text ?? "";

    // ── Grounding indicators ──────────────────────────────────────────────
    // Collect all unique document titles from raw (pre-filter) results
    const retrievedTitles = [
      ...new Set(
        this.toolCalls.flatMap((tc) =>
          tc.rawResults.map((r) => r.documentTitle).filter(Boolean)
        )
      ),
    ];

    const titlesReferencedInResponse = retrievedTitles.filter(
      (title) =>
        title.length > 0 &&
        responseText.toLowerCase().includes(title.toLowerCase())
    );

    const groundingScore =
      retrievedTitles.length > 0
        ? titlesReferencedInResponse.length / retrievedTitles.length
        : 0;

    // ── Confidence tier summary ───────────────────────────────────────────
    const tiers: Record<string, number> = {};
    for (const tc of this.toolCalls) {
      const tier = tc.confidenceAssessment.tier;
      tiers[tier] = (tiers[tier] ?? 0) + 1;
    }

    const anyLowConfidence = (tiers.low ?? 0) > 0;
    const anyHighConfidence = (tiers.high ?? 0) > 0;

    // ── Content gaps ──────────────────────────────────────────────────────
    // Tool calls that returned low confidence = potential KB gaps
    const contentGaps = this.toolCalls
      .filter((tc) => tc.confidenceAssessment.tier === "low")
      .map((tc) => `${tc.toolName}(${JSON.stringify(tc.input).slice(0, 120)})`);

    this.qualitySignals = {
      groundingIndicators: {
        retrievedTitles,
        titlesReferencedInResponse,
        groundingScore,
      },
      overallConfidence: {
        tiers,
        anyLowConfidence,
        anyHighConfidence,
      },
      contentGaps,
      safetyConcernFlag: this.sensitiveContent.detected,
    };
  }

  async flush(): Promise<void> {
    const entry: TurnEntry = {
      schemaVersion: LOG_SCHEMA_VERSION,
      metadata: this.metadata,
      userMessage: this.userMessage,
      sensitiveContent: this.sensitiveContent,
      toolCalls: this.toolCalls,
      response: this.response,
      qualitySignals: this.qualitySignals,
      durationMs: Date.now() - this.startTime,
    };

    await writeTurnEntry(entry.metadata.chatId, entry);
  }
}

// ─── Context holder (mutable so startTurn can swap the logger in) ─────────────

interface LoggerContext {
  logger: TurnLogger;
}

// ─── DevLogger singleton ─────────────────────────────────────────────────────

class DevLogger {
  private readonly storage = new AsyncLocalStorage<LoggerContext>();

  isEnabled(): boolean {
    return process.env.DEV_LOGGING === "true";
  }

  /**
   * Wraps a request handler in an AsyncLocalStorage context.
   * Must be called before startTurn() so that currentTurn() resolves
   * correctly inside tool execute functions spawned by streamText.
   *
   * When logging is disabled, fn() is called directly with no overhead.
   */
  run<T>(fn: () => T): T {
    if (!this.isEnabled()) return fn();
    const ctx: LoggerContext = { logger: new NoOpTurnLogger() };
    return this.storage.run(ctx, fn);
  }

  /**
   * Creates an ActiveTurnLogger for the current request and stores it
   * in the AsyncLocalStorage context established by run().
   *
   * The userId is hashed with SHA-256 before storage.
   */
  startTurn(options: {
    chatId: string;
    userId: string;
    selectedModel: string;
    effectiveModality: string | null;
    effectiveJurisdiction: string | null;
  }): TurnLogger {
    if (!this.isEnabled()) return new NoOpTurnLogger();

    const hashedUserId = createHash("sha256")
      .update(options.userId)
      .digest("hex");

    const metadata: TurnMetadata = {
      chatId: options.chatId,
      userId: hashedUserId,
      selectedModel: options.selectedModel,
      effectiveModality: options.effectiveModality,
      effectiveJurisdiction: options.effectiveJurisdiction,
      timestamp: new Date().toISOString(),
    };

    const logger = new ActiveTurnLogger(metadata);

    const ctx = this.storage.getStore();
    if (ctx) {
      ctx.logger = logger;
    }
    // If no context exists (shouldn't happen if run() was called), return
    // the logger anyway — it will still accumulate data but won't propagate
    // via currentTurn() to child contexts.

    return logger;
  }

  /**
   * Returns the TurnLogger for the current async context, or undefined
   * when logging is disabled or called outside a run() context.
   *
   * Tool functions call this without needing the logger passed explicitly.
   */
  currentTurn(): TurnLogger | undefined {
    if (!this.isEnabled()) return undefined;
    return this.storage.getStore()?.logger;
  }
}

export const devLogger = new DevLogger();
