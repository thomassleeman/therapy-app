"use client";

import {
  TRANSCRIPTION_STATUS_LABELS,
  type TranscriptionStatus,
} from "@/lib/db/types";
import { useTranscriptionStatus } from "./use-transcription-status";

const PHASE_STEPS: Record<TranscriptionStatus, number> = {
  pending: 0,
  uploading: 1,
  preparing: 2,
  transcribing: 3,
  labelling: 3, // same step — labelling happens inside the same blocking call
  saving: 4,
  completed: 5,
  failed: -1,
  not_applicable: -1,
};

const TOTAL_STEPS = 5;

export function useTranscriptionProgress(sessionId: string | null) {
  const { status, error, processingError, isPolling, reset } =
    useTranscriptionStatus(sessionId);

  const step = PHASE_STEPS[status] ?? 0;
  const progress =
    status === "failed" ? 0 : Math.round((step / TOTAL_STEPS) * 100);
  const label = TRANSCRIPTION_STATUS_LABELS[status] ?? "";

  return {
    progress,
    status,
    label,
    error,
    processingError,
    isPolling,
    reset,
  };
}
