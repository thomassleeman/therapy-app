"use client";

import Link from "next/link";

import type { TherapySession } from "@/lib/db/types";

interface SessionHeaderProps {
  session: TherapySession;
  clientId: string | null;
  clientName: string | null;
  backHref: string;
  backLabel: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SessionHeader({
  session,
  clientId,
  clientName,
  backHref,
  backLabel,
}: SessionHeaderProps) {
  return (
    <header className="bg-background border-b px-3 py-1.5 md:px-6 md:py-2">
      <Link
        className="text-xs text-muted-foreground hover:text-foreground transition-colors md:hidden"
        href={backHref}
      >
        &larr; {backLabel}
      </Link>
      <div className="flex items-center gap-3">
        <Link
          className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 hidden md:inline"
          href={backHref}
        >
          &larr; {backLabel}
        </Link>
        <span className="text-muted-foreground/40 hidden md:inline">|</span>
        <div className="flex items-baseline gap-1.5 md:gap-2 flex-wrap min-w-0">
          <h1 className="text-base md:text-lg font-semibold tracking-tight">
            {formatDate(session.sessionDate)}
          </h1>
          <span className="text-xs md:text-sm text-muted-foreground">
            {clientName && clientId && (
              <Link
                className="underline hover:text-foreground transition-colors"
                href={`/clients/${clientId}`}
              >
                {clientName}
              </Link>
            )}
            {clientName && clientId && session.deliveryMethod && " · "}
            {session.deliveryMethod && (
              <span className="capitalize">{session.deliveryMethod}</span>
            )}
            {session.durationMinutes && ` · ${session.durationMinutes} min`}
          </span>
        </div>
      </div>
    </header>
  );
}
