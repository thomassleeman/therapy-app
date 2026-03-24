"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { Check, Loader2, Lock, Send, Sparkles, X } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { NoteFormat, NoteStatus } from "@/lib/db/types";

import { flattenNoteContent } from "./flatten-note-content";

// ─── Constants ──────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  subjective: "Subjective",
  objective: "Objective",
  data: "Data",
  assessment: "Assessment",
  plan: "Plan",
  behaviour: "Behaviour",
  intervention: "Intervention",
  response: "Response",
  goals: "Goals",
  clinicalOpening: "Clinical Opening",
  sessionBody: "Session Body",
  clinicalSynthesis: "Clinical Synthesis & Risk",
  pathForward: "The Path Forward",
  body: "Notes",
};

const SECTION_ORDER: Record<NoteFormat, string[]> = {
  soap: ["subjective", "objective", "assessment", "plan"],
  dap: ["data", "assessment", "plan"],
  birp: ["behaviour", "intervention", "response", "plan"],
  girp: ["goals", "intervention", "response", "plan"],
  narrative: [
    "clinicalOpening",
    "sessionBody",
    "clinicalSynthesis",
    "pathForward",
  ],
};

const EXAMPLE_PROMPTS = [
  "Expand the assessment section",
  "Add risk considerations",
  "Reframe using person-centred language",
  "What's missing from these notes?",
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface NotesRefinementProps {
  sessionId: string;
  noteId: string;
  noteFormat: NoteFormat;
  noteStatus: NoteStatus;
  initialContent: Record<string, string>;
  onSave: (content: Record<string, string>) => Promise<void>;
  onStatusChange: (status: NoteStatus) => Promise<void>;
}

// ─── Auto-resize textarea ───────────────────────────────────────────────────

function AutoResizeTextarea({
  value,
  onChange,
  disabled,
  highlighted,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  highlighted: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  });

  return (
    <div
      className={`rounded-md transition-all duration-300 ${
        highlighted ? "ring-2 ring-primary/40 bg-primary/5" : ""
      }`}
    >
      <textarea
        className="w-full resize-none overflow-hidden border-none bg-transparent p-2 text-base leading-relaxed text-foreground outline-none focus:ring-0 disabled:cursor-default disabled:opacity-60"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        ref={ref}
        rows={1}
        value={value}
      />
    </div>
  );
}

// ─── Notes panel ────────────────────────────────────────────────────────────

function NotesPanel({
  noteFormat,
  noteStatus,
  noteContent,
  highlightedSections,
  hasUnsavedChanges,
  saving,
  onFieldChange,
  onSave,
  onStatusChange,
}: {
  noteFormat: NoteFormat;
  noteStatus: NoteStatus;
  noteContent: Record<string, string>;
  highlightedSections: Set<string>;
  hasUnsavedChanges: boolean;
  saving: boolean;
  onFieldChange: (key: string, value: string) => void;
  onSave: () => void;
  onStatusChange: (status: NoteStatus) => void;
}) {
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const isFinalised = noteStatus === "finalised";

  // Build ordered section list
  const orderedKeys = SECTION_ORDER[noteFormat] ?? [];
  const contentKeys = Object.keys(noteContent);
  const extraKeys = contentKeys.filter((k) => !orderedKeys.includes(k));
  const sectionKeys = [
    ...orderedKeys.filter((k) => k in noteContent),
    ...extraKeys,
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {noteStatus === "draft" && (
          <div className="mb-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            AI-generated draft — please review before finalising.
          </div>
        )}

        {isFinalised && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            These notes have been finalised and are locked for editing.
          </div>
        )}

        <div className="space-y-6">
          {sectionKeys.map((key) => (
            <div key={key}>
              <h3 className="mb-2 text-sm font-semibold tracking-wide text-foreground">
                {SECTION_LABELS[key] ?? key}
              </h3>
              <AutoResizeTextarea
                disabled={isFinalised}
                highlighted={highlightedSections.has(key)}
                onChange={(v) => onFieldChange(key, v)}
                value={noteContent[key] ?? ""}
              />
            </div>
          ))}
        </div>
      </div>

      {!isFinalised && (
        <div className="flex flex-wrap items-center gap-3 border-t p-4 lg:p-6">
          <Button
            className="min-h-11"
            disabled={!hasUnsavedChanges || saving}
            onClick={onSave}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save Changes
          </Button>

          {noteStatus === "draft" && (
            <Button
              className="min-h-11"
              disabled={saving}
              onClick={() => onStatusChange("reviewed")}
              variant="outline"
            >
              Mark as Reviewed
            </Button>
          )}

          {noteStatus === "reviewed" && (
            <Button
              className="min-h-11"
              disabled={saving}
              onClick={() => setConfirmFinalise(true)}
              variant="outline"
            >
              Finalise
            </Button>
          )}

          <AlertDialog onOpenChange={setConfirmFinalise} open={confirmFinalise}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Finalise Notes</AlertDialogTitle>
                <AlertDialogDescription>
                  Finalising will lock these notes for editing. You can
                  regenerate if changes are needed later. Are you sure?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onStatusChange("finalised");
                    setConfirmFinalise(false);
                  }}
                >
                  Finalise
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ─── Helper: extract text content from UIMessage parts ──────────────────────

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

// ─── Chat panel ─────────────────────────────────────────────────────────────

function ChatPanel({
  messages,
  input,
  isBusy,
  error,
  isFinalised,
  onInputChange,
  onSubmit,
  onSendPrompt,
  onRetry,
}: {
  messages: UIMessage[];
  input: string;
  isBusy: boolean;
  error: Error | undefined;
  isFinalised: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSendPrompt: (prompt: string) => void;
  onRetry: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });

  // Auto-resize input
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    }
  });

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
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-sm text-muted-foreground">
              Ask the AI to help refine your notes
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  key={prompt}
                  onClick={() => onSendPrompt(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasMessages && (
          <div className="space-y-3">
            {messages.map((message) => {
              const textContent = getMessageText(message);
              const toolResults = getToolCallResults(message);

              // Render tool call results as confirmation messages
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
            ref={inputRef}
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
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function NotesRefinement({
  sessionId,
  noteId,
  noteFormat,
  noteStatus,
  initialContent,
  onSave,
  onStatusChange,
}: NotesRefinementProps) {
  const [noteContent, setNoteContent] = useState<Record<string, string>>(() =>
    flattenNoteContent(
      initialContent as unknown as Parameters<typeof flattenNoteContent>[0]
    )
  );
  const [highlightedSections, setHighlightedSections] = useState<Set<string>>(
    new Set()
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [input, setInput] = useState("");

  // Keep a ref to noteContent so the transport body always has current values
  const noteContentRef = useRef(noteContent);
  noteContentRef.current = noteContent;

  // Track which tool call outputs we've already processed
  const processedToolCalls = useRef<Set<string>>(new Set());

  const { messages, setMessages, sendMessage, status, error, clearError } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/notes/refine",
        prepareSendMessagesRequest(request) {
          return {
            body: {
              ...request.body,
              messages: request.messages,
              sessionId,
              noteId,
              noteContent: noteContentRef.current,
              noteFormat,
            },
          };
        },
      }),
      onToolCall: ({ toolCall }) => {
        if (
          toolCall.toolName === "update_notes" &&
          "input" in toolCall &&
          toolCall.input
        ) {
          const args = toolCall.input as {
            updates: Array<{ section: string; content: string }>;
            summary: string;
          };

          setNoteContent((prev) => {
            const next = { ...prev };
            for (const update of args.updates) {
              if (update.section in prev) {
                next[update.section] = update.content;
              } else {
                console.warn(
                  `[notes-refinement] AI tried to update non-existent section: ${update.section}`
                );
              }
            }
            return next;
          });
          setHasUnsavedChanges(true);

          const updatedKeys = new Set(args.updates.map((u) => u.section));
          setHighlightedSections(updatedKeys);
          setTimeout(() => setHighlightedSections(new Set()), 2000);
        }
      },
    });

  // Also watch for tool call results in messages (for when tool output comes from server)
  useEffect(() => {
    for (const message of messages) {
      if (message.role === "assistant") {
        for (const part of message.parts) {
          if (
            "toolName" in part &&
            part.toolName === "update_notes" &&
            "state" in part &&
            part.state === "output-available" &&
            "toolCallId" in part &&
            "input" in part &&
            part.input
          ) {
            const callId = part.toolCallId as string;
            if (!processedToolCalls.current.has(callId)) {
              processedToolCalls.current.add(callId);

              const args = part.input as {
                updates: Array<{ section: string; content: string }>;
                summary: string;
              };

              setNoteContent((prev) => {
                const next = { ...prev };
                for (const update of args.updates) {
                  if (update.section in prev) {
                    next[update.section] = update.content;
                  } else {
                    console.warn(
                      `[notes-refinement] AI tried to update non-existent section: ${update.section}`
                    );
                  }
                }
                return next;
              });
              setHasUnsavedChanges(true);

              const updatedKeys = new Set(args.updates.map((u) => u.section));
              setHighlightedSections(updatedKeys);
              setTimeout(() => setHighlightedSections(new Set()), 2000);
            }
          }
        }
      }
    }
  }, [messages]);

  const isBusy = status === "submitted" || status === "streaming";

  // Warn on navigation with unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setNoteContent((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(noteContent);
      setHasUnsavedChanges(false);
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [noteContent, onSave]);

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasUnsavedChanges, handleSave]);

  const handleStatusChange = useCallback(
    async (newStatus: NoteStatus) => {
      setSaving(true);
      try {
        await onStatusChange(newStatus);
      } finally {
        setSaving(false);
      }
    },
    [onStatusChange]
  );

  const handleSendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed || isBusy) {
      return;
    }

    sendMessage({ text: trimmed });
    setInput("");
  };

  const handleSendPrompt = (prompt: string) => {
    if (!isBusy) {
      sendMessage({ text: prompt });
    }
  };

  const handleRetry = useCallback(() => {
    clearError();
    setMessages(messages.slice(0, -1));
  }, [clearError, setMessages, messages]);

  const isFinalised = noteStatus === "finalised";

  return (
    <>
      {/* Desktop: side-by-side layout */}
      <div className="hidden h-full lg:flex">
        {/* Notes panel — 55% */}
        <div className="flex w-[55%] flex-col border-r">
          <NotesPanel
            hasUnsavedChanges={hasUnsavedChanges}
            highlightedSections={highlightedSections}
            noteContent={noteContent}
            noteFormat={noteFormat}
            noteStatus={noteStatus}
            onFieldChange={handleFieldChange}
            onSave={handleSave}
            onStatusChange={handleStatusChange}
            saving={saving}
          />
        </div>

        {/* Chat panel — 45% */}
        <div className="flex w-[45%] flex-col">
          <ChatPanel
            error={error}
            input={input}
            isBusy={isBusy}
            isFinalised={isFinalised}
            messages={messages}
            onInputChange={setInput}
            onRetry={handleRetry}
            onSendPrompt={handleSendPrompt}
            onSubmit={handleSendMessage}
          />
        </div>
      </div>

      {/* Mobile: notes full-width + floating chat button */}
      <div className="flex h-full flex-col lg:hidden">
        <NotesPanel
          hasUnsavedChanges={hasUnsavedChanges}
          highlightedSections={highlightedSections}
          noteContent={noteContent}
          noteFormat={noteFormat}
          noteStatus={noteStatus}
          onFieldChange={handleFieldChange}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          saving={saving}
        />

        {/* Floating "Refine with AI" button */}
        {!isFinalised && (
          <button
            className="fixed bottom-6 right-6 z-50 flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
            onClick={() => setChatOpen(true)}
            type="button"
          >
            <Sparkles className="size-5" />
            <span className="hidden sm:inline">Refine with AI</span>
          </button>
        )}

        {/* Dimmed overlay */}
        <div
          aria-hidden="true"
          className={`fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
            chatOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setChatOpen(false)}
          role="presentation"
        />

        {/* Bottom sheet */}
        <div
          className={`fixed inset-x-0 bottom-0 z-50 flex h-[65dvh] flex-col rounded-t-xl bg-background shadow-2xl transition-transform duration-300 ease-out ${
            chatOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header with close button */}
          <div className="flex items-center justify-between border-b px-4 pb-2">
            <h3 className="text-sm font-medium">Refine with AI</h3>
            <button
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              onClick={() => setChatOpen(false)}
              type="button"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Chat content */}
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              error={error}
              input={input}
              isBusy={isBusy}
              isFinalised={isFinalised}
              messages={messages}
              onInputChange={setInput}
              onRetry={handleRetry}
              onSendPrompt={handleSendPrompt}
              onSubmit={handleSendMessage}
            />
          </div>
        </div>
      </div>
    </>
  );
}
