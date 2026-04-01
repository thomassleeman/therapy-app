"use client";

import type { UIMessage } from "ai";
import { Check, Lock, Send } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

interface RefinementChatProps {
  messages: UIMessage[];
  input: string;
  isBusy: boolean;
  error: Error | undefined;
  isFinalised: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

interface ToolCallInfo {
  toolName: string;
  output: unknown;
}

function getToolCallResults(message: UIMessage): ToolCallInfo[] {
  const results: ToolCallInfo[] = [];
  for (const part of message.parts) {
    if (
      "toolName" in part &&
      "state" in part &&
      part.state === "output-available" &&
      "output" in part
    ) {
      results.push({
        toolName: part.toolName as string,
        output: part.output,
      });
    }
  }
  return results;
}

export function RefinementChat({
  messages,
  input,
  isBusy,
  error,
  isFinalised,
  onInputChange,
  onSubmit,
  onRetry,
}: RefinementChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  const messageCount = messages.length;
  useEffect(() => {
    if (messageCount > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageCount]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isBusy && !isFinalised) {
        onSubmit();
      }
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        {!hasMessages && !isFinalised && (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Ask the AI to help refine your notes
            </p>
          </div>
        )}

        {hasMessages && (
          <div className="space-y-3">
            {messages.map((message) => {
              const textContent = getMessageText(message);
              const toolResults = getToolCallResults(message);

              const toolConfirmations = toolResults
                .filter((t) => t.toolName === "update_notes")
                .map((t) => {
                  const output = t.output as
                    | { summary?: string }
                    | string
                    | undefined;
                  const summary =
                    typeof output === "string"
                      ? output
                      : (output?.summary ?? "Notes updated");
                  return summary;
                });

              return (
                <div key={message.id}>
                  {/* Tool call confirmations */}
                  {toolConfirmations.map((summary, i) => (
                    <div
                      className="mb-2 flex items-start gap-2 text-sm text-muted-foreground"
                      key={`${message.id}-tool-${i}`}
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      <span>{summary}</span>
                    </div>
                  ))}

                  {/* Text content */}
                  {textContent && (
                    <div
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {textContent}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isBusy && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-lg bg-muted px-3 py-2">
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>Something went wrong. Please try again.</span>
          <Button onClick={onRetry} size="sm" variant="ghost">
            Retry
          </Button>
        </div>
      )}

      {/* Finalised banner */}
      {isFinalised && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          These notes are finalised. To make changes, regenerate from the
          session page.
        </div>
      )}

      {/* Input area */}
      <div className="border-t p-4">
        <div className="flex items-end gap-2">
          <textarea
            className="min-h-11 max-h-24 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy || isFinalised}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI to refine your notes..."
            rows={1}
            value={input}
          />
          <Button
            className="min-h-11 shrink-0"
            disabled={!input.trim() || isBusy || isFinalised}
            onClick={onSubmit}
            size="icon"
            type="button"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <span className="text-xs overflow-hidden truncate text-ellipsis">
          Remember AI tools can make mistakes. Always use your professional
          judgment.{" "}
        </span>
      </div>
    </div>
  );
}
