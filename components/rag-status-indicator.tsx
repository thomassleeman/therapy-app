"use client";

import {
  AlertTriangleIcon,
  BookOpenIcon,
  LightbulbIcon,
  SearchIcon,
} from "lucide-react";
import type { RagStatusData } from "@/lib/types";

interface RagStatusIndicatorProps {
  data: RagStatusData;
}

export function RagStatusIndicator({ data }: RagStatusIndicatorProps) {
  const { status, strategy, documentCount, confidenceTier } = data;

  if (status === "searching") {
    return (
      <div className="flex items-center gap-1.5 py-1 text-muted-foreground text-xs transition-opacity duration-300">
        <SearchIcon className="animate-pulse" size={14} />
        <span>
          Searching knowledge base
          <span className="ml-0.5 inline-flex">
            <span className="animate-bounce [animation-delay:0ms]">.</span>
            <span className="animate-bounce [animation-delay:150ms]">.</span>
            <span className="animate-bounce [animation-delay:300ms]">.</span>
          </span>
        </span>
      </div>
    );
  }

  if (status === "complete") {
    if (strategy === null) {
      return null;
    }

    if (strategy === "grounded") {
      const count = documentCount ?? 0;
      return (
        <div
          className={`flex items-center gap-1.5 py-1 text-xs transition-opacity duration-300 ${
            confidenceTier === "moderate"
              ? "text-muted-foreground/70"
              : "text-muted-foreground"
          }`}
        >
          <BookOpenIcon size={14} />
          <span>
            Based on {count} knowledge base document{count === 1 ? "" : "s"}
          </span>
        </div>
      );
    }

    if (strategy === "general_knowledge") {
      return (
        <div className="flex items-center gap-1.5 py-1 text-muted-foreground text-xs transition-opacity duration-300">
          <LightbulbIcon size={14} />
          <span>General clinical knowledge</span>
        </div>
      );
    }

    if (strategy === "graceful_decline") {
      return (
        <div className="flex items-center gap-1.5 py-1 text-amber-600 text-xs transition-opacity duration-300 dark:text-amber-400">
          <AlertTriangleIcon size={14} />
          <span>Specialist guidance recommended</span>
        </div>
      );
    }
  }

  return null;
}
