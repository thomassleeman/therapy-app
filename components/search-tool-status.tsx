"use client";

import type { ToolUIPart } from "ai";
import {
  AlertCircleIcon,
  BookOpenIcon,
  BrainIcon,
  CheckIcon,
  ClipboardListIcon,
  GavelIcon,
  SearchIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Maps the four knowledge-search tool type strings to user-friendly labels
 * and icons. The labels describe *what* is being searched so therapists
 * understand the response is grounded in specific clinical domains.
 */
const SEARCH_TOOL_CONFIG: Record<string, { label: string; icon: ReactNode }> = {
  "tool-searchKnowledgeBase": {
    label: "knowledge base",
    icon: <BookOpenIcon className="size-3.5" />,
  },
  "tool-searchLegislation": {
    label: "legislation",
    icon: <GavelIcon className="size-3.5" />,
  },
  "tool-searchGuidelines": {
    label: "clinical guidelines",
    icon: <ClipboardListIcon className="size-3.5" />,
  },
  "tool-searchTherapeuticContent": {
    label: "therapeutic frameworks",
    icon: <BrainIcon className="size-3.5" />,
  },
};

/** The tool-part type strings this component handles. */
export const SEARCH_TOOL_TYPES = new Set(Object.keys(SEARCH_TOOL_CONFIG));

/**
 * Returns a human-readable summary line from the tool output once complete.
 * Extracts the result count and confidence tier when available.
 */
function getResultSummary(output: unknown): string | null {
  if (!output || typeof output !== "object") {
    return null;
  }

  const o = output as Record<string, unknown>;

  // The knowledge search tools return { results: [...], confidenceTier, ... }
  const results = o.results;
  const count = Array.isArray(results) ? results.length : null;
  const tier = typeof o.confidenceTier === "string" ? o.confidenceTier : null;

  if (count === null) {
    return null;
  }
  if (count === 0) {
    return "No matching sources found";
  }

  const sourceWord = count === 1 ? "source" : "sources";

  if (tier === "high") {
    return `Found ${count} relevant ${sourceWord}`;
  }
  if (tier === "medium") {
    return `Found ${count} ${sourceWord} (moderate confidence)`;
  }
  if (tier === "low") {
    return `Found ${count} ${sourceWord} (low confidence)`;
  }

  return `Found ${count} ${sourceWord}`;
}

type SearchToolStatusProps = {
  type: string;
  state: ToolUIPart["state"];
  output?: unknown;
  toolCallId: string;
};

export function SearchToolStatus({
  type,
  state,
  output,
  toolCallId,
}: SearchToolStatusProps) {
  const config = SEARCH_TOOL_CONFIG[type];
  if (!config) {
    return null;
  }

  const isSearching =
    state === "input-streaming" || state === "input-available";
  const isComplete = state === "output-available";
  const isError = state === "output-error";

  const resultSummary = isComplete ? getResultSummary(output) : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 text-muted-foreground text-sm transition-opacity duration-300",
        isComplete && "opacity-70"
      )}
      data-testid={`search-status-${toolCallId}`}
    >
      {/* Icon: animated while searching, static when done */}
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          isSearching && "animate-pulse"
        )}
      >
        {isError ? (
          <AlertCircleIcon className="size-3.5 text-destructive" />
        ) : isComplete ? (
          <CheckIcon className="size-3.5 text-green-600 dark:text-green-500" />
        ) : (
          <SearchIcon className="size-3.5" />
        )}
      </span>

      {/* Domain icon */}
      <span className="flex shrink-0 items-center">{config.icon}</span>

      {/* Label */}
      <span>
        {isSearching && (
          <>
            Searching {config.label}
            <span className="inline-flex ml-0.5">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </>
        )}
        {isComplete && (resultSummary ?? `Searched ${config.label}`)}
        {isError && `Failed to search ${config.label}`}
      </span>
    </div>
  );
}
