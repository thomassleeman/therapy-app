/**
 * TypeScript interfaces for the dev-only RAG quality logging system.
 *
 * Location: lib/dev/types.ts
 *
 * All types are co-located here so the log-viewer CLI can import them
 * without pulling in Next.js server-only modules.
 *
 * Log files are JSONL: one TurnEntry JSON object per line.
 */

// ─── Schema versioning ───────────────────────────────────────────────────────

export const LOG_SCHEMA_VERSION = 1 as const;

// ─── Per-turn metadata ───────────────────────────────────────────────────────

export interface TurnMetadata {
  /** The chat/conversation ID from the DB. */
  chatId: string;
  /** SHA-256 hash of the user's Supabase ID — never the raw ID. */
  userId: string;
  /** The model ID selected for this turn (e.g. "grok-3-mini"). */
  selectedModel: string;
  /** The resolved therapeutic modality, or null if none. */
  effectiveModality: string | null;
  /** The resolved jurisdiction (e.g. "UK", "EU"), or null. */
  effectiveJurisdiction: string | null;
  /** ISO 8601 timestamp at the start of the turn. */
  timestamp: string;
}

// ─── Raw search result (before confidence filtering) ─────────────────────────

export interface RawSearchResultEntry {
  documentTitle: string;
  /** Cosine similarity score — null when found only via FTS. */
  similarityScore: number | null;
  rrfScore: number;
  /** First 200 characters of chunk content. */
  contentPreview: string;
  modality: string | null;
  jurisdiction: string | null;
}

// ─── Filtered result (after confidence threshold) ────────────────────────────

export interface FilteredResultEntry {
  documentTitle: string;
  similarityScore: number | null;
  /** First 200 characters of chunk content. */
  contentPreview: string;
  modality: string | null;
  jurisdiction: string | null;
}

// ─── Individual tool call record ─────────────────────────────────────────────

export interface ToolCallTiming {
  /** Time from start to end of embed() call, in milliseconds. */
  embeddingMs: number;
  /** Time from end of embedding to end of RPC call, in milliseconds. */
  searchMs: number;
  /** Total tool execution time including confidence filtering. */
  totalMs: number;
}

export interface ConfidenceAssessmentEntry {
  tier: "high" | "moderate" | "low";
  note: string | null;
  averageSimilarity: number;
  maxSimilarity: number;
  /** Number of results dropped for being below the low threshold. */
  droppedCount: number;
}

export interface ToolCallEntry {
  /** Tool name as registered in streamText (e.g. "searchLegislation"). */
  toolName: string;
  /** The input parameters the LLM passed to the tool. */
  input: Record<string, unknown>;
  timing: ToolCallTiming;
  /** All results from the RPC before confidence filtering. */
  rawResults: RawSearchResultEntry[];
  confidenceAssessment: ConfidenceAssessmentEntry;
  /** Results passed back to the LLM after confidence filtering. */
  filteredResults: FilteredResultEntry[];
}

// ─── Quality signals (derived post-response) ─────────────────────────────────

export interface GroundingIndicators {
  /** Unique document titles across all rawResults for this turn. */
  retrievedTitles: string[];
  /** Subset of retrievedTitles found (case-insensitive) in the response text. */
  titlesReferencedInResponse: string[];
  /** Proportion: titlesReferencedInResponse.length / retrievedTitles.length (0–1). */
  groundingScore: number;
}

export interface OverallConfidenceSummary {
  /** Map of tier → count across all tool calls (e.g. { high: 2, low: 1 }). */
  tiers: Record<string, number>;
  anyLowConfidence: boolean;
  anyHighConfidence: boolean;
}

export interface QualitySignals {
  groundingIndicators: GroundingIndicators;
  overallConfidence: OverallConfidenceSummary;
  /**
   * Human-readable strings identifying tool calls that returned low-confidence
   * results — indicates gaps in the knowledge base for those queries.
   * E.g. ['searchLegislation({"query":"...","jurisdiction":"UK"})']
   */
  contentGaps: string[];
  /** True if any sensitive category was detected in the user message. */
  safetyConcernFlag: boolean;
}

// ─── Full turn log entry ─────────────────────────────────────────────────────

export interface TurnEntry {
  /** Schema version — increment when the shape changes. */
  schemaVersion: typeof LOG_SCHEMA_VERSION;
  metadata: TurnMetadata;
  /** First 500 characters of the user's message (non-identifying). */
  userMessage: string;
  sensitiveContent: {
    detected: boolean;
    categories: string[];
  };
  toolCalls: ToolCallEntry[];
  response: {
    /** First 500 characters of the assistant response text. */
    text: string;
    totalTokens?: number;
    finishReason?: string;
  } | null;
  qualitySignals: QualitySignals | null;
  /** Wall-clock duration of the full turn from startTurn() to flush(). */
  durationMs: number;
}

// ─── Log session (for the viewer) ────────────────────────────────────────────

export interface SessionSummary {
  chatId: string;
  filePath: string;
  turnCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export interface AggregateSummary {
  date: string;
  totalTurns: number;
  avgDurationMs: number;
  toolCallDistribution: Record<string, number>;
  confidenceTierDistribution: Record<string, number>;
  /** chatId + toolName entries where low confidence was frequently returned. */
  commonContentGaps: string[];
  avgGroundingScore: number;
}
