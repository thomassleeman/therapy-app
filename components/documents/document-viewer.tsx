"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  GripHorizontal,
  GripVertical,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { RefinementChat } from "@/components/sessions/refinement-chat";
import { toast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClinicalDocumentWithReferences } from "@/lib/db/types";
import type { DocumentTypeConfig } from "@/lib/documents/types";
import {
  extractErrorMessage,
  showErrorToast,
} from "@/lib/errors/client-error-handler";
import { cn } from "@/lib/utils";

interface Props {
  document: ClinicalDocumentWithReferences;
  typeConfig: DocumentTypeConfig;
  clientId: string;
  clientName: string;
  initialCommentary?: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  draft: "bg-amber-600 text-white dark:bg-amber-900/30 dark:text-amber-400",
  reviewed: "bg-blue-600 text-white dark:bg-blue-900/30 dark:text-blue-400",
  finalised: "bg-green-600 text-white dark:bg-green-900/30 dark:text-green-400",
};

function ReferenceIcon({ type }: { type: string }) {
  switch (type) {
    case "session":
      return <MessageSquare className="size-4 shrink-0" />;
    case "clinical_document":
      return <FileText className="size-4 shrink-0" />;
    default:
      return <FileText className="size-4 shrink-0" />;
  }
}

function referenceLabel(type: string): string {
  switch (type) {
    case "session":
      return "Session";
    case "clinical_note":
      return "Progress Note";
    case "clinical_document":
      return "Document";
    default:
      return "Reference";
  }
}

export function DocumentViewer({
  document: initialDocument,
  typeConfig,
  clientId,
  clientName,
  initialCommentary,
}: Props) {
  const router = useRouter();
  const [document, setDocument] = useState(initialDocument);
  const [editedBody, setEditedBody] = useState(document.content.body);
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);

  const isEditable =
    document.status === "draft" || document.status === "reviewed";
  const isFinalised = document.status === "finalised";
  const isDirty = editedBody !== document.content.body || editedTitle !== null;

  // Keep refs so the transport body always has current values
  // (useChat creates its Chat instance once — closures in the transport are frozen from that first render)
  const documentTextRef = useRef(editedBody);
  documentTextRef.current = editedBody;
  const documentTypeRef = useRef(document.documentType);
  documentTypeRef.current = document.documentType;

  // Track which tool call outputs we've already processed
  const processedToolCalls = useRef<Set<string>>(new Set());

  // Chat input state
  const [chatInput, setChatInput] = useState("");

  // Responsive panel direction
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // ─── useChat hook ───────────────────────────────────────────────────────────
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error: chatError,
    clearError,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/documents/refine",
      prepareSendMessagesRequest(request: any) {
        return {
          body: {
            ...request.body,
            messages: request.messages,
            documentId: document.id,
            documentText: documentTextRef.current,
            documentType: documentTypeRef.current,
          },
        };
      },
    }),
    onToolCall: ({ toolCall }) => {
      if (
        toolCall.toolName === "update_document" &&
        "input" in toolCall &&
        toolCall.input
      ) {
        const args = toolCall.input as {
          updatedDocument: string;
          summary: string;
        };
        setEditedBody(args.updatedDocument);
      }
    },
  });

  // Watch for tool call results in messages (server-side tool output)
  useEffect(() => {
    for (const message of messages) {
      if (message.role === "assistant") {
        for (const part of message.parts) {
          if (
            "toolName" in part &&
            part.toolName === "update_document" &&
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
                updatedDocument: string;
                summary: string;
              };
              setEditedBody(args.updatedDocument);
            }
          }
        }
      }
    }
  }, [messages]);

  // Inject commentary as first assistant message (from props or sessionStorage)
  const commentaryInjected = useRef(false);
  useEffect(() => {
    if (commentaryInjected.current || messages.length > 0) {
      return;
    }
    const storageKey = `doc-commentary-${document.id}`;
    const commentary = initialCommentary ?? sessionStorage.getItem(storageKey);
    if (commentary) {
      commentaryInjected.current = true;
      sessionStorage.removeItem(storageKey);
      setMessages([
        {
          id: `commentary-${document.id}`,
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: commentary }],
        },
      ]);
    }
  }, [initialCommentary, document.id, messages.length, setMessages]);

  const isChatBusy = status === "submitted" || status === "streaming";

  // ─── Auto-resize textarea ──────────────────────────────────────────────────
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: editedBody must trigger resize when content changes externally (e.g. AI tool calls)
  useEffect(() => {
    adjustHeight();
  }, [editedBody, adjustHeight]);

  // ─── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};

      if (editedBody !== document.content.body) {
        body.content = { body: editedBody };
      }
      if (editedTitle !== null) {
        body.title = editedTitle;
      }

      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = await res.json().catch(() => null);
        if (!updated) {
          throw new Error("Received an invalid response from the server.");
        }
        setDocument((prev) => ({ ...prev, ...updated }));
        setEditedTitle(null);
        toast({ type: "success", description: "Document saved." });
      } else {
        const message = await extractErrorMessage(
          res,
          "Failed to save document. Please try again."
        );
        toast({ type: "error", description: message });
      }
    } catch (err) {
      showErrorToast(err, "Failed to save document. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [document, editedBody, editedTitle]);

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, handleSave]);

  // ─── Delete handler ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({ type: "success", description: "Document deleted." });
        router.push(`/clients/${clientId}`);
      } else {
        const message = await extractErrorMessage(
          res,
          "Failed to delete document. Please try again."
        );
        toast({ type: "error", description: message });
      }
    } catch (err) {
      showErrorToast(err, "Failed to delete document. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [document.id, clientId, router]);

  // ─── Status update handler ─────────────────────────────────────────────────
  const handleStatusUpdate = useCallback(
    async (status: "reviewed" | "finalised") => {
      setSaving(true);
      try {
        const body: Record<string, unknown> = { status };
        if (status === "reviewed") {
          body.reviewedAt = new Date().toISOString();
        }

        const res = await fetch(`/api/documents/${document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const updated = await res.json().catch(() => null);
          if (!updated) {
            throw new Error("Received an invalid response from the server.");
          }
          setDocument((prev) => ({ ...prev, ...updated }));
          router.refresh();
        } else {
          const message = await extractErrorMessage(
            res,
            "Failed to update document status. Please try again."
          );
          toast({ type: "error", description: message });
        }
      } catch (err) {
        showErrorToast(
          err,
          "Failed to update document status. Please try again."
        );
      } finally {
        setSaving(false);
        setConfirmFinalise(false);
      }
    },
    [document.id, router]
  );

  // ─── Chat handlers ──────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatBusy) {
      return;
    }
    sendMessage({ text: trimmed });
    setChatInput("");
  }, [chatInput, isChatBusy, sendMessage]);

  const handleRetry = useCallback(() => {
    clearError();
    setMessages(messages.slice(0, -1));
  }, [clearError, setMessages, messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-background border-b px-4 py-4 md:px-6">
        <div className="mb-3">
          <Link
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            href={`/clients/${clientId}`}
          >
            &larr; {clientName}
          </Link>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            {isEditable ? (
              <input
                className="text-2xl font-semibold tracking-tight border-none outline-none w-full focus:ring-0 p-0 rounded-md"
                onChange={(e) => setEditedTitle(e.target.value)}
                type="text"
                value={editedTitle ?? document.title}
              />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">
                {document.title}
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge className="hover:bg-inherit" variant="outline">
                {typeConfig.label}
              </Badge>
              <Badge
                className={`hover:bg-inherit ${STATUS_BADGE_STYLES[document.status] ?? ""}`}
              >
                {document.status.charAt(0).toUpperCase() +
                  document.status.slice(1)}
              </Badge>
              {document.version > 1 && (
                <span className="text-xs">v{document.version}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatDate(document.createdAt)}
              {document.updatedAt !== document.createdAt &&
                ` \u00B7 Updated ${formatDateTime(document.updatedAt)}`}
            </p>
          </div>

          {(document.status === "reviewed" ||
            document.status === "finalised") && (
            <Button
              className="shrink-0"
              onClick={async () => {
                try {
                  const res = await fetch(
                    `/api/documents/${document.id}/export`
                  );
                  if (!res.ok) {
                    toast({
                      type: "error",
                      description:
                        "Failed to export document. Please try again.",
                    });
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const link = window.document.createElement("a");
                  link.href = url;
                  const disposition = res.headers.get("Content-Disposition");
                  const filenameMatch = disposition?.match(/filename="(.+)"/);
                  link.download = filenameMatch?.[1] ?? "document.docx";
                  link.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  showErrorToast(
                    err,
                    "Failed to export document. Please try again."
                  );
                }
              }}
              size="sm"
              variant="outline"
            >
              <Download className="size-4" />
              Export as Word
            </Button>
          )}
        </div>
      </header>

      {/* Content area: resizable panels */}
      <PanelGroup
        className="min-h-0 flex-1"
        direction={isDesktop ? "horizontal" : "vertical"}
        key={isDesktop ? "horizontal" : "vertical"}
      >
        {/* LEFT / TOP PANEL — document editor */}
        <Panel defaultSize={60} minSize={25} order={1}>
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-4 md:px-6 space-y-6 max-w-4xl">
                {/* AI Warning Banner */}
                {document.status === "draft" && document.generatedBy === "ai" && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-4 py-3">
                    <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      This document was generated by AI and requires clinical review
                      before finalising. Please verify all content against your
                      clinical records.
                    </p>
                  </div>
                )}

                {/* References Section */}
                {document.references.length > 0 && (
                  <div className="rounded-lg border">
                    <button
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                      onClick={() => setReferencesOpen(!referencesOpen)}
                      type="button"
                    >
                      <span>
                        Based on {document.references.length} source
                        {document.references.length === 1 ? "" : "s"}
                      </span>
                      {referencesOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                    {referencesOpen && (
                      <div className="border-t px-4 py-3 space-y-2">
                        {document.references.map((ref) => {
                          const label = referenceLabel(ref.referenceType);
                          const date = formatDate(ref.createdAt);

                          let href: string | null = null;
                          if (ref.referenceType === "session") {
                            href = `/sessions/${ref.referenceId}`;
                          } else if (ref.referenceType === "clinical_document") {
                            href = `/clients/${clientId}/documents/${ref.referenceId}`;
                          }

                          const inner = (
                            <>
                              <ReferenceIcon type={ref.referenceType} />
                              <span>
                                {label} &mdash; {date}
                              </span>
                            </>
                          );

                          return href ? (
                            <Link
                              className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                              href={href}
                              key={ref.id}
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5" key={ref.id}>
                              {inner}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Document Content */}
                {isFinalised && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    <Lock className="size-4 shrink-0" />
                    This document has been finalised and is locked for editing.
                  </div>
                )}

                {document.status === "draft" && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    AI-generated draft &mdash; please review before finalising.
                  </div>
                )}

                <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-background">
                  <textarea
                    className="min-h-[400px] w-full resize-none overflow-hidden border-none bg-transparent p-2 font-mono text-sm leading-relaxed text-foreground outline-none focus:ring-0 disabled:cursor-default disabled:opacity-60"
                    disabled={!isEditable}
                    onChange={(e) => {
                      setEditedBody(e.target.value);
                      adjustHeight();
                    }}
                    ref={textareaRef}
                    value={editedBody}
                  />
                </div>
              </div>
            </div>

            {/* Actions Bar — pinned at bottom */}
            <div className="shrink-0 border-t px-4 py-3 md:px-6">
              <div className="flex flex-wrap items-center gap-3">
                {isEditable && (
                  <>
                    <Button
                      disabled={saving || !isDirty}
                      onClick={handleSave}
                      size="sm"
                    >
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Save Changes
                    </Button>

                    {document.status === "draft" && (
                      <Button
                        disabled={saving}
                        onClick={() => handleStatusUpdate("reviewed")}
                        size="sm"
                        variant="outline"
                      >
                        Mark as Reviewed
                      </Button>
                    )}

                    {document.status === "reviewed" && (
                      <Button
                        disabled={saving}
                        onClick={() => setConfirmFinalise(true)}
                        size="sm"
                        variant="outline"
                      >
                        Finalise
                      </Button>
                    )}

                    {document.status === "draft" && (
                      <Button
                        disabled={saving}
                        onClick={() => setConfirmRegenerate(true)}
                        size="sm"
                        variant="ghost"
                      >
                        <RefreshCw className="size-4" />
                        Regenerate
                      </Button>
                    )}
                  </>
                )}

                {isFinalised && (
                  <Button
                    onClick={() =>
                      router.push(
                        `/clients/${clientId}/documents/generate?type=${document.documentType}&supersedesId=${document.id}`
                      )
                    }
                    size="sm"
                    variant="outline"
                  >
                    Create New Version
                  </Button>
                )}

                <Button
                  className="ml-auto"
                  disabled={saving || deleting}
                  onClick={() => setConfirmDelete(true)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </Panel>

        {/* RESIZE HANDLE */}
        <PanelResizeHandle
          className={cn(
            "flex items-center justify-center bg-muted/50 transition-colors hover:bg-muted active:bg-muted",
            isDesktop
              ? "w-2 border-x border-border"
              : "h-2 border-y border-border"
          )}
        >
          {isDesktop ? (
            <GripVertical className="size-4 text-muted-foreground" />
          ) : (
            <GripHorizontal className="size-4 text-muted-foreground" />
          )}
        </PanelResizeHandle>

        {/* RIGHT / BOTTOM PANEL — refinement chat */}
        <Panel defaultSize={40} minSize={20} order={2}>
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <RefinementChat
              error={chatError}
              finalisedLabel="document"
              input={chatInput}
              isBusy={isChatBusy}
              isFinalised={isFinalised}
              messages={messages}
              onInputChange={setChatInput}
              onRetry={handleRetry}
              onSubmit={handleSendMessage}
              placeholder="Ask the AI to help refine this document..."
              updateToolName="update_document"
            />
          </div>
        </Panel>
      </PanelGroup>

      {/* Finalise Confirmation Dialog */}
      <Dialog onOpenChange={setConfirmFinalise} open={confirmFinalise}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalise Document</DialogTitle>
            <DialogDescription>
              Finalising this document will lock it for editing. You can create
              a new version if changes are needed later. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmFinalise(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() => handleStatusUpdate("finalised")}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Finalise Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation Dialog */}
      <Dialog onOpenChange={setConfirmRegenerate} open={confirmRegenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Document</DialogTitle>
            <DialogDescription>
              This will discard the current draft and regenerate the document
              from scratch. Any edits you have made will be lost. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmRegenerate(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmRegenerate(false);
                router.push(
                  `/clients/${clientId}/documents/generate?type=${document.documentType}&regenerateId=${document.id}`
                );
              }}
              variant="destructive"
            >
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmDelete(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={handleDelete}
              variant="destructive"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
