"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useClients } from "@/hooks/use-clients";
import { useSessions } from "@/hooks/use-sessions";
import type { TherapySessionWithClient } from "@/lib/db/types";
import { PlusIcon } from "./icons";
import {
  ListPageEmpty,
  ListPageShell,
  ListPageSkeleton,
} from "./list-page";
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

// ── Main component ────────────────────────────────────────────────────

export function SessionsPage() {
  const { sessions, isLoading, refresh } = useSessions();
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
        <ListPageSkeleton />
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
