"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClients } from "@/hooks/use-clients";
import { useSessions } from "@/hooks/use-sessions";
import type { TherapySessionWithClient } from "@/lib/db/types";
import { PlusIcon } from "./icons";
import { ListPageEmpty, ListPageShell } from "./list-page";
import { SessionsTable } from "./sessions-table";

// ── Summary cards ─────────────────────────────────────────────────────

interface SummaryCounts {
  awaitingNotes: number;
  transcribing: number;
  failed: number;
}

function computeSummaryCounts(
  sessions: TherapySessionWithClient[]
): SummaryCounts {
  let awaitingNotes = 0;
  let transcribing = 0;
  let failed = 0;

  for (const s of sessions) {
    if (s.transcriptionStatus === "failed") {
      failed++;
    }
    if (
      s.transcriptionStatus === "transcribing" ||
      s.transcriptionStatus === "labelling" ||
      s.transcriptionStatus === "uploading"
    ) {
      transcribing++;
    }
    if (
      (s.transcriptionStatus === "completed" ||
        s.transcriptionStatus === "not_applicable") &&
      (s.notesStatus === "none" ||
        s.notesStatus === "" ||
        s.notesStatus === "draft")
    ) {
      awaitingNotes++;
    }
  }

  return { awaitingNotes, transcribing, failed };
}

function SummaryCards({ counts }: { counts: SummaryCounts }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card className="border-amber-200 dark:border-amber-800 py-0">
        <CardContent className="px-4 py-3">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {counts.awaitingNotes}
          </p>
          <p className="text-xs text-muted-foreground">Awaiting notes</p>
        </CardContent>
      </Card>
      <Card className="border-blue-200 dark:border-blue-800 py-0">
        <CardContent className="px-4 py-3">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {counts.transcribing}
          </p>
          <p className="text-xs text-muted-foreground">Transcribing</p>
        </CardContent>
      </Card>
      <Card className="border-red-200 dark:border-red-800 py-0">
        <CardContent className="px-4 py-3">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {counts.failed}
          </p>
          <p className="text-xs text-muted-foreground">Failed</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────

function SessionsPageSkeleton() {
  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {["card-1", "card-2", "card-3"].map((id) => (
          <Card className="py-0" key={id}>
            <CardContent className="px-4 py-3">
              <Skeleton className="h-8 w-10 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search bar */}
      <Skeleton className="h-9 w-full rounded-md" />

      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-[120px] rounded-md" />
        <Skeleton className="h-8 w-[140px] rounded-md" />
        <Skeleton className="h-8 w-[180px] rounded-md" />
      </div>

      {/* Table */}
      <div className="mt-4 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {/* Table header */}
            <div className="flex items-center gap-4 border-b py-3">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="hidden h-3 w-14 sm:block" />
              <Skeleton className="hidden h-3 w-16 md:block" />
              <Skeleton className="h-3 w-20 ml-auto" />
              <Skeleton className="hidden h-3 w-12 lg:block" />
              <Skeleton className="h-3 w-8" />
            </div>
            {/* Table rows */}
            {["row-1", "row-2", "row-3", "row-4", "row-5"].map((id) => (
              <div className="flex items-center gap-4 border-b py-4" key={id}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="hidden h-4 w-28 sm:block" />
                <Skeleton className="hidden h-4 w-16 md:block" />
                <Skeleton className="h-5 w-20 rounded-full ml-auto" />
                <Skeleton className="hidden h-5 w-16 rounded-full lg:block" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function SessionsPage() {
  const { sessions, isLoading, error: sessionsError, refresh } = useSessions();
  const { clients } = useClients();

  const summaryCounts = useMemo(
    () => computeSummaryCounts(sessions),
    [sessions]
  );

  return (
    <ListPageShell
      count={sessions.length}
      headerAction={
        <Button asChild size="sm">
          <Link href="/sessions/new">
            <PlusIcon />
            <span>New Session</span>
          </Link>
        </Button>
      }
      isLoading={isLoading}
      subtitle="Workflow view across all clients"
      title="Sessions"
    >
      {isLoading ? (
        <SessionsPageSkeleton />
      ) : sessionsError && sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Failed to load sessions. Please try refreshing the page.
          </p>
          <Button onClick={() => refresh()} size="sm" variant="outline">
            Try again
          </Button>
        </div>
      ) : (
        <>
          {sessions.length === 0 && (
            <ListPageEmpty
              action={
                <Button asChild variant="outline">
                  <Link href="/sessions/new">
                    <PlusIcon />
                    <span>Start Your First Session</span>
                  </Link>
                </Button>
              }
              description="Record or upload your first session to get started."
              title="No sessions yet"
            />
          )}

          {sessions.length > 0 && (
            <>
              <SummaryCards counts={summaryCounts} />
              <SessionsTable
                clients={clients}
                onDeleted={refresh}
                sessions={sessions}
              />
            </>
          )}
        </>
      )}
    </ListPageShell>
  );
}
