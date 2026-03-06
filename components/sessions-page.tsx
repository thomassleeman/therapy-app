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
import { useSessions } from "@/hooks/use-sessions";
import type {
  TherapySessionWithClient,
  TranscriptionStatus,
} from "@/lib/db/types";
import {
  ListPageEmpty,
  ListPageFilters,
  ListPageSearch,
  ListPageShell,
  ListPageSkeleton,
} from "./list-page";
import { PlusIcon, TrashIcon } from "./icons";

type SessionFilter = "completed" | "transcribing" | "pending" | "failed";

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
  if (!minutes) return "\u2014";
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function TranscriptionBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
          Completed
        </Badge>
      );
    case "transcribing":
    case "labelling":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 animate-pulse">
          Transcribing
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100">
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
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100">
          Draft
        </Badge>
      );
    case "reviewed":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100">
          Reviewed
        </Badge>
      );
    case "finalised":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
          Finalised
        </Badge>
      );
    case "generating":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 animate-pulse">
          Generating
        </Badge>
      );
    default:
      return <Badge variant="secondary">None</Badge>;
  }
}

export function SessionsPage() {
  const router = useRouter();
  const { sessions, isLoading, refresh } = useSessions();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionFilter | "all">(
    "all"
  );
  const [deleteSession, setDeleteSession] =
    useState<TherapySessionWithClient | null>(null);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== "all" && !matchesFilter(s.transcriptionStatus, statusFilter)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fields = [
          s.clientName,
          formatDate(s.sessionDate),
          s.deliveryMethod,
        ];
        return fields.some((f) => f?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [sessions, searchQuery, statusFilter]);

  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "all";

  const handleDelete = () => {
    if (!deleteSession) return;

    const deletePromise = fetch(`/api/sessions/${deleteSession.id}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting session...",
      success: () => {
        refresh();
        setDeleteSession(null);
        return "Session deleted.";
      },
      error: "Failed to delete session",
    });
  };

  return (
    <ListPageShell
      title="Sessions"
      count={filteredSessions.length}
      isLoading={isLoading}
      headerAction={
        <Button asChild size="sm">
          <Link href="/sessions/new">
            <PlusIcon />
            <span>New Session</span>
          </Link>
        </Button>
      }
    >
      {!isLoading && sessions.length > 0 && (
        <>
          <ListPageSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search sessions by client, date, or delivery method..."
          />
          <ListPageFilters
            options={SESSION_FILTER_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </>
      )}

      {isLoading ? (
        <ListPageSkeleton />
      ) : (
        <>
          {sessions.length === 0 && (
            <ListPageEmpty
              title="No sessions yet"
              description="Record or upload your first session to get started."
              action={
                <Button asChild variant="outline">
                  <Link href="/sessions/new">
                    <PlusIcon />
                    <span>Start Your First Session</span>
                  </Link>
                </Button>
              }
            />
          )}

          {sessions.length > 0 &&
            filteredSessions.length === 0 &&
            hasActiveFilters && (
              <ListPageEmpty
                title="No sessions match your search"
                description="Try adjusting your search term or status filter."
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
                          scope="col"
                          className="py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pl-0"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:table-cell"
                        >
                          Client
                        </th>
                        <th
                          scope="col"
                          className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase md:table-cell"
                        >
                          Duration
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                        >
                          Transcription
                        </th>
                        <th
                          scope="col"
                          className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase lg:table-cell"
                        >
                          Notes
                        </th>
                        <th scope="col" className="py-3 pr-4 pl-3 sm:pr-0">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredSessions.map((s) => (
                        <tr
                          key={s.id}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-4 pr-3 pl-4 sm:pl-0">
                            <Link
                              className="text-sm font-medium hover:underline"
                              href={`/sessions/${s.id}`}
                            >
                              {formatDate(s.sessionDate)}
                            </Link>
                            {/* Show client inline on mobile */}
                            {s.clientName && (
                              <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                                {s.clientName}
                              </p>
                            )}
                          </td>

                          <td className="hidden px-3 py-4 sm:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {s.clientName ?? "\u2014"}
                            </span>
                          </td>

                          <td className="hidden px-3 py-4 md:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {formatDuration(s.durationMinutes)}
                            </span>
                          </td>

                          <td className="px-3 py-4">
                            <TranscriptionBadge
                              status={s.transcriptionStatus}
                            />
                          </td>

                          <td className="hidden px-3 py-4 lg:table-cell">
                            <NotesBadge status={s.notesStatus} />
                          </td>

                          <td className="py-4 pr-4 pl-3 text-right whitespace-nowrap sm:pr-0">
                            <div className="flex items-center justify-end gap-1">
                              <Button asChild size="sm" variant="ghost">
                                <Link href={`/sessions/${s.id}`}>View</Link>
                              </Button>
                              <Button
                                className="size-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteSession(s)}
                                size="icon"
                                variant="ghost"
                              >
                                <TrashIcon />
                                <span className="sr-only">Delete session</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteSession(null);
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
    </ListPageShell>
  );
}
