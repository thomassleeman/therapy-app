"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TherapySessionWithClient, TranscriptionStatus } from "@/lib/db/types";
import { TrashIcon } from "./icons";
import { ListPageEmpty, ListPageFilters, ListPageSearch } from "./list-page";

type SessionFilter = "completed" | "transcribing" | "pending" | "failed";
type NotesFilter = "none" | "draft" | "reviewed" | "finalised";

const SESSION_FILTER_OPTIONS: { value: SessionFilter; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "transcribing", label: "Transcribing" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

function matchesFilter(
  status: TranscriptionStatus,
  filter: SessionFilter
): boolean {
  switch (filter) {
    case "transcribing":
      return (
        status === "transcribing" ||
        status === "labelling" ||
        status === "uploading"
      );
    case "pending":
      return status === "pending";
    case "completed":
      return status === "completed";
    case "failed":
      return status === "failed";
    default:
      return false;
  }
}

function matchesNotesFilter(notesStatus: string, filter: NotesFilter): boolean {
  switch (filter) {
    case "none":
      return notesStatus === "none" || notesStatus === "";
    case "draft":
      return notesStatus === "draft";
    case "reviewed":
      return notesStatus === "reviewed";
    case "finalised":
      return notesStatus === "finalised";
    default:
      return false;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(minutes: number | null): string {
  if (!minutes) {
    return "\u2014";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function TranscriptionBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-600 text-white dark:bg-green-900/30 dark:text-green-400 hover:bg-green-600">
          Completed
        </Badge>
      );
    case "not_applicable":
      return <Badge variant="secondary">Written Notes</Badge>;
    case "transcribing":
    case "labelling":
      return (
        <Badge className="bg-blue-600 text-white dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-600 animate-pulse">
          Transcribing
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-600 text-white dark:bg-red-900/30 dark:text-red-400 hover:bg-red-600">
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          {status === "uploading" ? "Uploading" : "Pending"}
        </Badge>
      );
  }
}

function NotesBadge({ status }: { status: string }) {
  switch (status) {
    case "draft":
      return (
        <Badge className="bg-amber-600 text-white dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-600">
          Draft
        </Badge>
      );
    case "reviewed":
      return (
        <Badge className="bg-blue-600 text-white dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-600">
          Reviewed
        </Badge>
      );
    case "finalised":
      return (
        <Badge className="bg-green-600 text-white dark:bg-green-900/30 dark:text-green-400 hover:bg-green-600">
          Finalised
        </Badge>
      );
    case "generating":
      return (
        <Badge className="bg-blue-600 text-white dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-600 animate-pulse">
          Generating
        </Badge>
      );
    default:
      return <Badge variant="secondary">None</Badge>;
  }
}

interface SessionsTableProps {
  sessions: TherapySessionWithClient[];
  hideClientColumn?: boolean;
  clientId?: string;
  clients?: { id: string; name: string }[];
  onDeleted?: () => void;
}

export function SessionsTable({
  sessions,
  hideClientColumn = false,
  clientId,
  clients,
  onDeleted,
}: SessionsTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionFilter | "all">("all");
  const [notesFilter, setNotesFilter] = useState<NotesFilter | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [deleteSession, setDeleteSession] =
    useState<TherapySessionWithClient | null>(null);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (
        statusFilter !== "all" &&
        !matchesFilter(s.transcriptionStatus, statusFilter)
      ) {
        return false;
      }
      if (
        notesFilter !== "all" &&
        !matchesNotesFilter(s.notesStatus, notesFilter)
      ) {
        return false;
      }
      if (
        !hideClientColumn &&
        clientFilter !== "all" &&
        s.clientId !== clientFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fields = hideClientColumn
          ? [formatDate(s.sessionDate), s.deliveryMethod]
          : [s.clientName, formatDate(s.sessionDate), s.deliveryMethod];
        return fields.some((f) => f?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [sessions, searchQuery, statusFilter, notesFilter, clientFilter, hideClientColumn]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    notesFilter !== "all" ||
    (!hideClientColumn && clientFilter !== "all");

  const handleDelete = () => {
    if (!deleteSession) {
      return;
    }

    const deletePromise = fetch(`/api/sessions/${deleteSession.id}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting session...",
      success: () => {
        onDeleted?.();
        router.refresh();
        setDeleteSession(null);
        return "Session deleted.";
      },
      error: "Failed to delete session",
    });
  };

  return (
    <>
      <ListPageSearch
        onChange={setSearchQuery}
        placeholder={
          hideClientColumn
            ? "Search sessions by date or delivery method..."
            : "Search sessions by client, date, or delivery method..."
        }
        value={searchQuery}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ListPageFilters
          onChange={setStatusFilter}
          options={SESSION_FILTER_OPTIONS}
          value={statusFilter}
        />

        <Select
          onValueChange={(v) => setNotesFilter(v as NotesFilter | "all")}
          value={notesFilter}
        >
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Notes status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All notes</SelectItem>
            <SelectItem value="none">No notes</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="finalised">Finalised</SelectItem>
          </SelectContent>
        </Select>

        {!hideClientColumn && clients && clients.length > 0 && (
          <Select onValueChange={setClientFilter} value={clientFilter}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filteredSessions.length === 0 && hasActiveFilters && (
        <ListPageEmpty
          description="Try adjusting your search term or filters."
          title="No sessions match your search"
        />
      )}

      {filteredSessions.length > 0 && (
        <div className="mt-4 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th
                      className="py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pl-0"
                      scope="col"
                    >
                      Date
                    </th>
                    {!hideClientColumn && (
                      <th
                        className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:table-cell"
                        scope="col"
                      >
                        Client
                      </th>
                    )}
                    <th
                      className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase md:table-cell"
                      scope="col"
                    >
                      Duration
                    </th>
                    <th
                      className="px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      scope="col"
                    >
                      Transcription
                    </th>
                    <th
                      className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase lg:table-cell"
                      scope="col"
                    >
                      Notes
                    </th>
                    <th className="py-3 pr-4 pl-3 sm:pr-0" scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSessions.map((s) => (
                    <tr
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      key={s.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("a, button")) {
                          return;
                        }
                        router.push(`/sessions/${s.id}${clientId ? "?from=client" : ""}`);
                      }}
                    >
                      <td className="py-4 pr-3 pl-4 sm:pl-0">
                        <Link
                          className="text-sm font-medium hover:underline"
                          href={`/sessions/${s.id}${clientId ? "?from=client" : ""}`}
                        >
                          {formatDate(s.sessionDate)}
                        </Link>
                        {!hideClientColumn && s.clientName && (
                          <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                            {s.clientId ? (
                              <Link
                                className="hover:underline"
                                href={`/clients/${s.clientId}`}
                              >
                                {s.clientName}
                              </Link>
                            ) : (
                              s.clientName
                            )}
                          </p>
                        )}
                      </td>

                      {!hideClientColumn && (
                        <td className="hidden px-3 py-4 sm:table-cell">
                          {s.clientId ? (
                            <Link
                              className="text-sm text-muted-foreground hover:underline hover:text-foreground"
                              href={`/clients/${s.clientId}`}
                            >
                              {s.clientName ?? "\u2014"}
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {s.clientName ?? "\u2014"}
                            </span>
                          )}
                        </td>
                      )}

                      <td className="hidden px-3 py-4 md:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {formatDuration(s.durationMinutes)}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <TranscriptionBadge status={s.transcriptionStatus} />
                      </td>

                      <td className="hidden px-3 py-4 lg:table-cell">
                        <NotesBadge status={s.notesStatus} />
                      </td>

                      <td className="py-4 pr-4 pl-3 text-right whitespace-nowrap sm:pr-0">
                        <Button
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteSession(s)}
                          size="icon"
                          variant="ghost"
                        >
                          <TrashIcon />
                          <span className="sr-only">Delete session</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSession(null);
          }
        }}
        open={deleteSession !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this session, including its audio
              recording, transcript, clinical notes, and consent records. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
