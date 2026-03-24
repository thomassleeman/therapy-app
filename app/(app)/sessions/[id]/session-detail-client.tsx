"use client";

import {
  AlertCircle,
  ArrowRight,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { CaseFormulationNudge } from "@/components/notes/case-formulation-nudge";
import { NotesRefinement } from "@/components/notes/notes-refinement";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTranscriptionStatus } from "@/hooks/use-transcription-status";
import {
  type ClinicalDocument,
  type ClinicalNote,
  type NoteFormat,
  type NoteStatus,
  type SessionConsent,
  type SessionSegment,
  type TherapySession,
  TRANSCRIPTION_STATUS_LABELS,
} from "@/lib/db/types";
import {
  extractErrorMessage,
  showErrorToast,
} from "@/lib/errors/client-error-handler";

interface Props {
  session: TherapySession;
  segments: SessionSegment[];
  notes: ClinicalNote[];
  consents: SessionConsent[];
  clientId: string | null;
  clientName: string | null;
  caseFormulation: ClinicalDocument | null;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

const SPEAKER_COLORS: Record<string, string> = {
  therapist: "text-blue-700 dark:text-blue-400",
  client: "text-emerald-700 dark:text-emerald-400",
};

function getSpeakerColor(speaker: string): string {
  const lower = speaker.toLowerCase();
  if (lower.includes("therapist") || lower === "speaker 1") {
    return SPEAKER_COLORS.therapist;
  }
  if (lower.includes("client") || lower === "speaker 2") {
    return SPEAKER_COLORS.client;
  }
  return "text-purple-700 dark:text-purple-400";
}

const FORMAT_DESCRIPTIONS: Record<NoteFormat, string> = {
  soap: "Subjective, Objective, Assessment, Plan — the most widely used clinical note format.",
  dap: "Data, Assessment, Plan — a streamlined alternative to SOAP.",
  birp: "Behaviour, Intervention, Response, Plan — tracks observable behaviours and skills acquisition.",
  girp: "Goals, Intervention, Response, Plan — goal-driven format linking sessions to treatment plans.",
  narrative:
    "Chronological narrative covering session opening, body, clinical synthesis, and path forward.",
};

// ─── Transcript Tab ────────────────────────────────────────────────────────

function TranscriptTab({
  session,
  segments,
}: {
  session: TherapySession;
  segments: SessionSegment[];
}) {
  const { status: polledStatus } = useTranscriptionStatus(
    session.transcriptionStatus !== "completed" &&
      session.transcriptionStatus !== "failed"
      ? session.id
      : null
  );

  const effectiveStatus =
    polledStatus === "pending" ? session.transcriptionStatus : polledStatus;

  if (effectiveStatus !== "completed" && effectiveStatus !== "failed") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">
            {TRANSCRIPTION_STATUS_LABELS[effectiveStatus]}
          </p>
          <p className="text-xs text-muted-foreground">
            This usually takes 2-4 minutes for a 50-minute session.
          </p>
        </div>
      </div>
    );
  }

  if (effectiveStatus === "failed") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm font-medium text-destructive">
          Transcription failed
        </p>
        {session.errorMessage && (
          <p className="text-xs text-muted-foreground">
            {session.errorMessage}
          </p>
        )}
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-sm text-muted-foreground">
          No transcript segments available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {segments.map((segment) => (
        <div className="flex gap-4 py-3" key={segment.id}>
          <span className="w-12 shrink-0 pt-0.5 text-right text-xs text-muted-foreground tabular-nums">
            {formatTimestamp(segment.startTimeMs)}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-xs font-semibold uppercase tracking-wide mb-1 ${getSpeakerColor(segment.speaker)}`}
            >
              {segment.speaker}
            </p>
            <p className="text-sm leading-relaxed">{segment.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Notes Tab ─────────────────────────────────────────────────────────────

function NotesTab({
  session,
  notes: initialNotes,
  clientId,
  clientAlias,
  caseFormulation,
}: {
  session: TherapySession;
  notes: ClinicalNote[];
  clientId: string | null;
  clientAlias: string | null;
  caseFormulation: ClinicalDocument | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [selectedFormat, setSelectedFormat] = useState<NoteFormat>("soap");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [justFinalised, setJustFinalised] = useState(false);

  const activeNote = notes[0] ?? null;

  const handleGenerate = useCallback(
    async (format: NoteFormat) => {
      setGenerating(true);
      try {
        const res = await fetch("/api/notes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            noteFormat: format,
            additionalContext: additionalContext || undefined,
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
        setNotes([note]);
      } catch (err) {
        showErrorToast(err, "Failed to generate notes. Please try again.");
      } finally {
        setGenerating(false);
      }
    },
    [session.id, additionalContext]
  );

  const handleSaveNotes = useCallback(
    async (content: Record<string, string>) => {
      try {
        const res = await fetch(`/api/sessions/${session.id}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: activeNote?.id,
            content,
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
          setNotes([updated]);
        }
        toast({ type: "success", description: "Notes saved." });
      } catch (err) {
        showErrorToast(err, "Failed to save notes. Please try again.");
      }
    },
    [activeNote?.id, session.id]
  );

  const handleStatusChange = useCallback(
    async (newStatus: NoteStatus) => {
      if (!activeNote) {
        return;
      }
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
            setNotes([updated]);
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
      }
    },
    [activeNote, session.id, router]
  );

  const handleDelete = useCallback(async () => {
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
        setNotes([]);
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
      setConfirmDelete(false);
    }
  }, [activeNote, session.id, router]);

  // No notes yet — show generation form
  if (!activeNote) {
    if (
      session.transcriptionStatus !== "completed" &&
      session.transcriptionStatus !== "not_applicable"
    ) {
      return (
        <div className="flex flex-col items-center gap-4 py-12">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Notes can be generated after the transcript is complete.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1">
            Generate Clinical Notes
          </h3>
          <p className="text-sm text-muted-foreground">
            Select a note format and our AI will generate a draft from your
            session transcript for review.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.entries(FORMAT_DESCRIPTIONS) as [NoteFormat, string][]).map(
            ([format, desc]) => (
              <label
                className={`flex cursor-pointer flex-col rounded-lg border p-4 transition-colors ${
                  selectedFormat === format
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                key={format}
              >
                <input
                  checked={selectedFormat === format}
                  className="sr-only"
                  name="note-format"
                  onChange={() => setSelectedFormat(format)}
                  type="radio"
                  value={format}
                />
                <span className="text-sm font-medium uppercase">{format}</span>
                <span className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {desc}
                </span>
              </label>
            )
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="additional-context">
            Additional therapist observations (optional)
          </Label>
          <Textarea
            id="additional-context"
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Add any observations not captured in the transcript, e.g. non-verbal cues, your clinical impressions..."
            rows={3}
            value={additionalContext}
          />
        </div>

        <Button
          className="w-full min-h-12"
          disabled={generating}
          onClick={() => handleGenerate(selectedFormat)}
          size="lg"
        >
          {generating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Generating clinical notes... This may take up to a minute.
            </>
          ) : (
            <>
              <FileText className="size-4" />
              Generate Notes
            </>
          )}
        </Button>
      </div>
    );
  }

  // Notes exist — show refinement interface
  return (
    <div className="space-y-4">
      <NotesRefinement
        initialContent={activeNote.content as unknown as Record<string, string>}
        key={activeNote.id}
        noteFormat={activeNote.noteFormat}
        noteId={activeNote.id}
        noteStatus={activeNote.status}
        onSave={handleSaveNotes}
        onStatusChange={handleStatusChange}
        sessionId={session.id}
      />

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button
          className="min-h-11"
          disabled={generating || activeNote.status === "finalised"}
          onClick={() => handleGenerate(activeNote.noteFormat)}
          size="lg"
          variant="ghost"
        >
          <RefreshCw className="size-4" />
          Regenerate
        </Button>

        <Button
          className="min-h-11 ml-auto"
          disabled={deleting}
          onClick={() => setConfirmDelete(true)}
          size="lg"
          variant="ghost"
        >
          <Trash2 className="size-4 text-destructive" />
          <span className="text-destructive">Delete</span>
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              This will permanently delete this clinical note. You can
              regenerate notes afterwards if needed.
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
                "Delete Note"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {justFinalised && clientId && clientAlias && (
        <CaseFormulationNudge
          clientAlias={clientAlias}
          clientId={clientId}
          formationLastUpdated={caseFormulation?.updatedAt ?? null}
          hasExistingFormulation={caseFormulation !== null}
          sessionDate={session.sessionDate}
        />
      )}
    </div>
  );
}

// ─── Details Tab ───────────────────────────────────────────────────────────

function DetailsTab({
  session,
  consents,
  redirectHref,
}: {
  session: TherapySession;
  consents: SessionConsent[];
  redirectHref: string;
}) {
  const router = useRouter();
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteSession = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast({ type: "success", description: "Session deleted." });
        router.push(redirectHref);
      } else {
        const message = await extractErrorMessage(
          res,
          "Failed to delete session. Please try again."
        );
        toast({ type: "error", description: message });
      }
    } catch (err) {
      showErrorToast(err, "Failed to delete session. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDeleteSession(false);
    }
  }, [session.id, router, redirectHref]);

  return (
    <div className="space-y-8">
      {/* Session metadata */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Session Information
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="text-sm font-medium">
              {formatDate(session.sessionDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-sm font-medium">
              {session.durationMinutes
                ? `${session.durationMinutes} minutes`
                : "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Delivery Method</p>
            <p className="text-sm font-medium capitalize">
              {session.deliveryMethod ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm font-medium">
              {formatDateTime(session.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Consent records */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Consent Records
        </h3>
        {consents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No consent records found.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Consented</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consents.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm capitalize">
                      {c.consentType.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {c.consentingParty}
                    </TableCell>
                    <TableCell>
                      {c.consented ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="destructive">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(c.consentedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      {/* Danger zone */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-destructive">
          Danger Zone
        </h3>
        <div className="rounded-lg border border-destructive/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Session</p>
              <p className="text-xs text-muted-foreground mt-1">
                Permanently remove this session and all associated data.
              </p>
            </div>
            <Button
              className="min-h-11"
              onClick={() => setConfirmDeleteSession(true)}
              size="lg"
              variant="destructive"
            >
              <Trash2 className="size-4" />
              Delete Session
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Session Dialog */}
      <Dialog
        onOpenChange={setConfirmDeleteSession}
        open={confirmDeleteSession}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              This will permanently delete the session record, transcript, and
              notes. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmDeleteSession(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={handleDeleteSession}
              variant="destructive"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete Session"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

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

  const backHref =
    from === "client" && clientId
      ? `/clients/${clientId}?tab=sessions`
      : "/sessions";
  const backLabel =
    from === "client" && clientId
      ? `Sessions - ${clientName ?? "Client"}`
      : "Sessions";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      {/* Header */}
      <header className="bg-background border-b px-4 py-4 md:px-6">
        <div className="mb-3">
          <Link
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            href={backHref}
          >
            &larr; {backLabel}
          </Link>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Session — {formatDate(session.sessionDate)}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {clientName && clientId && (
                <>
                  <span>Client: </span>
                  <Link
                    className="underline hover:text-foreground transition-colors"
                    href={`/clients/${clientId}`}
                  >
                    {clientName}
                  </Link>
                </>
              )}
              {clientName && clientId && session.deliveryMethod && " \u00B7 "}
              {session.deliveryMethod && (
                <span className="capitalize">{session.deliveryMethod}</span>
              )}
              {session.durationMinutes &&
                ` \u00B7 ${session.durationMinutes} minutes`}
            </p>
          </div>

          {session.chatId ? (
            <Link
              className="flex w-full items-center justify-between rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors dark:bg-green-950 dark:text-green-200 dark:hover:bg-green-900 sm:w-auto sm:justify-start sm:gap-2"
              href={`/chat/${session.chatId}`}
            >
              <span>Chat About This Session</span>
              <ArrowRight className="size-4" />
            </Link>
          ) : session.transcriptionStatus === "completed" ||
            session.transcriptionStatus === "not_applicable" ? (
            <Link
              className="flex w-full items-center justify-between rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors dark:bg-green-950 dark:text-green-200 dark:hover:bg-green-900 sm:w-auto sm:justify-start sm:gap-2"
              href={`/chat/new?clientId=${session.clientId ?? "general"}&sessionId=${session.id}`}
            >
              <span>Chat About this Session</span>
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <div>
              <Link
                className="flex w-full items-center justify-between rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900 sm:w-auto sm:justify-start sm:gap-2"
                href={`/chat/new?clientId=${session.clientId ?? "general"}&sessionId=${session.id}`}
              >
                <span>
                  Start Reflection
                  {clientName ? ` for ${clientName}` : ""}
                </span>
                <ArrowRight className="size-4" />
              </Link>
              <p className="text-xs text-muted-foreground mt-1.5 px-1">
                Transcript not yet available — the AI won't have access to the
                session recording
              </p>
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex-1 px-4 py-4 md:px-6">
        <Tabs onValueChange={handleTabChange} value={activeTab}>
          <TabsList>
            {!isWrittenNotes && (
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
            )}
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          {!isWrittenNotes && (
            <TabsContent className="mt-4" value="transcript">
              <TranscriptTab segments={segments} session={session} />
            </TabsContent>
          )}

          <TabsContent className="mt-4" value="notes">
            <NotesTab
              caseFormulation={caseFormulation}
              clientAlias={clientName}
              clientId={clientId}
              notes={notes}
              session={session}
            />
          </TabsContent>

          <TabsContent className="mt-4" value="details">
            <DetailsTab
              consents={consents}
              redirectHref={backHref}
              session={session}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
