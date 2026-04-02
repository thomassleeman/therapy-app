"use client";

import { AlertCircle, Loader2 } from "lucide-react";

import { CopyErrorReport } from "@/components/transcription/copy-error-report";
import { useTranscriptionStatus } from "@/hooks/use-transcription-status";
import type { SessionSegment, TherapySession } from "@/lib/db/types";
import { TRANSCRIPTION_STATUS_LABELS } from "@/lib/db/types";

interface TranscriptViewProps {
  session: TherapySession;
  segments: SessionSegment[];
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

export function TranscriptView({ session, segments }: TranscriptViewProps) {
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
        {session.processingError && (
          <CopyErrorReport
            processingError={session.processingError}
            sessionId={session.id}
          />
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
