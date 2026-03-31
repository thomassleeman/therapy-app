"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { GripHorizontal, GripVertical } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { CaseFormulationNudge } from "@/components/notes/case-formulation-nudge";

import { NotesActionsBar } from "@/components/sessions/notes-actions-bar";
import { NotesEditor } from "@/components/sessions/notes-editor";
import { NotesGenerateForm } from "@/components/sessions/notes-generate-form";
import { RefinementChat } from "@/components/sessions/refinement-chat";
import { SessionDetailsTab } from "@/components/sessions/session-details-tab";
import { SessionHeader } from "@/components/sessions/session-header";
import { TranscriptView } from "@/components/sessions/transcript-view";
import { toast } from "@/components/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ClinicalDocument,
  ClinicalNote,
  NoteStatus,
  SessionConsent,
  SessionSegment,
  TherapySession,
} from "@/lib/db/types";
import {
  extractErrorMessage,
  showErrorToast,
} from "@/lib/errors/client-error-handler";
import { cn } from "@/lib/utils";

interface Props {
  session: TherapySession;
  segments: SessionSegment[];
  notes: ClinicalNote[];
  consents: SessionConsent[];
  clientId: string | null;
  clientName: string | null;
  caseFormulation: ClinicalDocument | null;
}

export function SessionDetailClient({
  session,
  segments,
  notes,
  consents,
  clientId,
  clientName,
  caseFormulation,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const isWrittenNotes = session.recordingType === "written_notes";
  const defaultTab = isWrittenNotes ? "notes" : "transcript";
  const activeTab = searchParams.get("tab") ?? defaultTab;

  // Back navigation
  const backHref =
    from === "client" && clientId
      ? `/clients/${clientId}?tab=sessions`
      : "/sessions";
  const backLabel =
    from === "client" && clientId
      ? `Sessions - ${clientName ?? "Client"}`
      : "Sessions";

  // Notes state
  const [currentNotes, setCurrentNotes] = useState(notes);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [justFinalised, setJustFinalised] = useState(false);
  const activeNote = currentNotes[0] ?? null;
  const hasNotes = activeNote !== null;

  // Note editing state (lifted to page level so both editor and chat can access)
  const [noteText, setNoteText] = useState<string>(
    activeNote?.content.body ?? ""
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-initialise note text when the active note changes (e.g. after generation)
  const activeNoteContent = activeNote?.content ?? null;
  useEffect(() => {
    if (activeNoteContent) {
      setNoteText(activeNoteContent.body);
      setHasUnsavedChanges(false);
    } else {
      setNoteText("");
    }
  }, [activeNoteContent]);

  // Keep refs so the transport body always has current values
  // (useChat creates its Chat instance once — closures in the transport are frozen from that first render)
  const noteTextRef = useRef(noteText);
  noteTextRef.current = noteText;
  const noteFormatRef = useRef(activeNote?.noteFormat ?? "");
  noteFormatRef.current = activeNote?.noteFormat ?? "";

  // Track which tool call outputs we've already processed
  const processedToolCalls = useRef<Set<string>>(new Set());

  // Chat input state (managed here so it persists across tab switches)
  const [chatInput, setChatInput] = useState("");

  // Responsive panel direction — horizontal on desktop, vertical on mobile
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
      api: "/api/notes/refine",
      prepareSendMessagesRequest(request) {
        return {
          body: {
            ...request.body,
            messages: request.messages,
            sessionId: session.id,
            noteText: noteTextRef.current,
            noteFormat: noteFormatRef.current,
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
          updatedNote: string;
          summary: string;
        };
        setNoteText(args.updatedNote);
        setHasUnsavedChanges(true);
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
                updatedNote: string;
                summary: string;
              };
              setNoteText(args.updatedNote);
              setHasUnsavedChanges(true);
            }
          }
        }
      }
    }
  }, [messages]);

  const isChatBusy = status === "submitted" || status === "streaming";
  const isFinalised = activeNote?.status === "finalised";

  // ─── Tab navigation ─────────────────────────────────────────────────────────
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`);
  };

  // ─── Note text editing ──────────────────────────────────────────────────────
  const handleNoteTextChange = useCallback((text: string) => {
    setNoteText(text);
    setHasUnsavedChanges(true);
  }, []);

  // ─── Save notes ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeNote) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: activeNote.id,
          content: { body: noteText },
        }),
      });

      if (!res.ok) {
        const message = await extractErrorMessage(
          res,
          "Failed to save notes. Please try again."
        );
        toast({ type: "error", description: message });
        return;
      }

      const updated = await res.json().catch(() => null);
      if (updated) {
        setCurrentNotes([updated]);
      }
      setHasUnsavedChanges(false);
      toast({ type: "success", description: "Notes saved." });
    } catch (err) {
      showErrorToast(err, "Failed to save notes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [activeNote, session.id, noteText]);

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

  // ─── Status change ──────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(
    async (newStatus: NoteStatus) => {
      if (!activeNote) {
        return;
      }
      setSaving(true);
      try {
        const res = await fetch(`/api/sessions/${session.id}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: activeNote.id,
            status: newStatus,
            reviewedAt:
              newStatus === "reviewed" ? new Date().toISOString() : undefined,
          }),
        });

        if (res.ok) {
          const updated = await res.json().catch(() => null);
          if (updated) {
            setCurrentNotes([updated]);
          }
          if (newStatus === "finalised") {
            setJustFinalised(true);
          }
          router.refresh();
        } else {
          const message = await extractErrorMessage(
            res,
            "Failed to update note status. Please try again."
          );
          toast({ type: "error", description: message });
        }
      } catch (err) {
        showErrorToast(err, "Failed to update note status. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [activeNote, session.id, router]
  );

  // ─── Regenerate notes ───────────────────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (!activeNote) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch("/api/notes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          noteFormat: activeNote.noteFormat,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate notes");
      }

      const note = await res.json().catch(() => null);
      if (!note) {
        throw new Error("Received an invalid response from the server.");
      }
      setCurrentNotes([note]);
    } catch (err) {
      showErrorToast(err, "Failed to generate notes. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }, [activeNote, session.id]);

  // ─── Delete notes ───────────────────────────────────────────────────────────
  const handleDeleteNote = useCallback(async () => {
    if (!activeNote) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: activeNote.id }),
      });

      if (res.ok) {
        setCurrentNotes([]);
        toast({ type: "success", description: "Note deleted." });
        router.refresh();
      } else {
        const message = await extractErrorMessage(
          res,
          "Failed to delete note. Please try again."
        );
        toast({ type: "error", description: message });
      }
    } catch (err) {
      showErrorToast(err, "Failed to delete note. Please try again.");
    } finally {
      setDeleting(false);
    }
  }, [activeNote, session.id, router]);

  // ─── Notes generation callback ──────────────────────────────────────────────
  const handleNotesGenerated = useCallback(
    (note: ClinicalNote, commentary?: string) => {
      setCurrentNotes([note]);
      if (commentary) {
        setMessages([
          {
            id: `commentary-${note.id}`,
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: commentary }],
          },
        ]);
      }
    },
    [setMessages]
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
      {/* 1. Session Header */}
      <div className="shrink-0 px-4 py-1 sm:px-6">
        <SessionHeader
          backHref={backHref}
          backLabel={backLabel}
          clientId={clientId}
          clientName={clientName}
          session={session}
        />
      </div>

      {/* 2. Tabs */}
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <div className="shrink-0 border-b px-4 sm:px-6">
          <TabsList>
            {!isWrittenNotes && (
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
            )}
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
        </div>

        {/* Content area: resizable panels — horizontal on desktop, vertical on mobile */}
        <PanelGroup
          className="min-h-0 flex-1"
          direction={isDesktop ? "horizontal" : "vertical"}
          key={isDesktop ? "horizontal" : "vertical"}
        >
          {/* TOP / LEFT PANEL — notes & tab content */}
          <Panel defaultSize={hasNotes ? 75 : 100} minSize={25} order={1}>
            <div className="flex h-full min-h-0 flex-col">
              {/* Scrollable tab content */}
              <div className="flex-1 overflow-y-auto">
                {!isWrittenNotes && (
                  <TabsContent
                    className="mt-0 px-4 py-4 sm:px-6"
                    value="transcript"
                  >
                    <TranscriptView segments={segments} session={session} />
                  </TabsContent>
                )}

                <TabsContent className="mt-0" value="notes">
                  {hasNotes ? (
                    <div>
                      <NotesEditor
                        noteFormat={activeNote.noteFormat}
                        noteStatus={activeNote.status}
                        noteText={noteText}
                        onNoteTextChange={handleNoteTextChange}
                      />

                      {justFinalised && clientId && clientName && (
                        <div className="px-4 pb-4 sm:px-6">
                          <CaseFormulationNudge
                            clientAlias={clientName}
                            clientId={clientId}
                            formationLastUpdated={
                              caseFormulation?.updatedAt ?? null
                            }
                            hasExistingFormulation={caseFormulation !== null}
                            sessionDate={session.sessionDate}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-4 sm:px-6">
                      <NotesGenerateForm
                        onNotesGenerated={handleNotesGenerated}
                        sessionId={session.id}
                        transcriptionStatus={session.transcriptionStatus}
                      />
                    </div>
                  )}
                </TabsContent>

                <TabsContent className="mt-0 px-4 py-4 sm:px-6" value="details">
                  <SessionDetailsTab
                    consents={consents}
                    onSessionDeleted={() => router.push(backHref)}
                    session={session}
                  />
                </TabsContent>
              </div>

              {/* Notes Actions Bar — pinned at bottom, Notes tab only */}
              {activeTab === "notes" && hasNotes && (
                <div className="shrink-0">
                  <NotesActionsBar
                    hasUnsavedChanges={hasUnsavedChanges}
                    isDeleting={deleting}
                    isRegenerating={regenerating}
                    isSaving={saving}
                    noteStatus={activeNote.status}
                    onDelete={handleDeleteNote}
                    onRegenerate={handleRegenerate}
                    onSave={handleSave}
                    onStatusChange={handleStatusChange}
                  />
                </div>
              )}
            </div>
          </Panel>

          {/* RESIZE HANDLE — vertical grip on desktop, horizontal grip on mobile */}
          {hasNotes && (
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
          )}

          {/* BOTTOM / RIGHT PANEL — chat */}
          {hasNotes && (
            <Panel defaultSize={45} minSize={20} order={2}>
              <div className="flex h-full min-h-0 flex-1 flex-col">
                <RefinementChat
                  error={chatError}
                  input={chatInput}
                  isBusy={isChatBusy}
                  isFinalised={isFinalised ?? false}
                  messages={messages}
                  onInputChange={setChatInput}
                  onRetry={handleRetry}
                  onSubmit={handleSendMessage}
                />
              </div>
            </Panel>
          )}
        </PanelGroup>
      </Tabs>
    </div>
  );
}
