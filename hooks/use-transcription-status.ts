"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProcessingError, TranscriptionStatus } from "@/lib/db/types";

interface UseTranscriptionStatusReturn {
  status: TranscriptionStatus;
  error: string | null;
  processingError: ProcessingError | null;
  isPolling: boolean;
  reset: () => void;
}

const POLL_INTERVAL = 5000;

/** Per-stage timeout thresholds in milliseconds */
const STAGE_TIMEOUT_MS: Partial<Record<TranscriptionStatus, number>> = {
  uploading: 30_000, // 30s — should be near-instant
  preparing: 30_000, // 30s — download + decrypt
  transcribing: 300_000, // 5 min — legitimate transcription time
  labelling: 300_000, // 5 min — same blocking call as transcribing
  saving: 30_000, // 30s — DB insert
};

export function useTranscriptionStatus(
  sessionId: string | null
): UseTranscriptionStatusReturn {
  const [status, setStatus] = useState<TranscriptionStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [processingError, setProcessingError] =
    useState<ProcessingError | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusChangeRef = useRef<{ status: TranscriptionStatus; at: number }>({
    status: "pending",
    at: Date.now(),
  });
  const consecutiveFailuresRef = useRef(0);
  const MAX_CONSECUTIVE_FAILURES = 3;

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const poll = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        throw new Error("Failed to check transcription status");
      }

      const data = await response.json();
      const transcriptionStatus = data.session
        ?.transcriptionStatus as TranscriptionStatus;

      // Successful poll — reset consecutive failure counter
      consecutiveFailuresRef.current = 0;

      if (transcriptionStatus) {
        // Track status changes for stuck-state detection
        if (transcriptionStatus !== lastStatusChangeRef.current.status) {
          lastStatusChangeRef.current = {
            status: transcriptionStatus,
            at: Date.now(),
          };
        }

        setStatus(transcriptionStatus);
      }

      if (
        transcriptionStatus === "completed" ||
        transcriptionStatus === "failed"
      ) {
        if (transcriptionStatus === "failed") {
          setError(data.session?.errorMessage ?? "Transcription failed");
          setProcessingError(data.session?.processingError ?? null);
        }
        stopPolling();
        return;
      }

      // Stuck-state detection: if the status hasn't changed within the
      // threshold for the current stage, treat it as a stall.
      const threshold = STAGE_TIMEOUT_MS[transcriptionStatus];
      if (threshold) {
        const elapsed = Date.now() - lastStatusChangeRef.current.at;
        if (elapsed > threshold) {
          const stageLabel =
            transcriptionStatus === "uploading"
              ? "uploading"
              : transcriptionStatus === "preparing"
                ? "preparing audio"
                : transcriptionStatus === "saving"
                  ? "saving transcript"
                  : "transcription";

          const stallError: ProcessingError = {
            stage:
              transcriptionStatus === "uploading"
                ? "upload"
                : transcriptionStatus === "preparing"
                  ? "preparing"
                  : transcriptionStatus === "saving"
                    ? "saving"
                    : "transcribing",
            error: `Processing appears to have stalled at ${stageLabel}`,
            code: "STAGE_TIMEOUT",
            occurredAt: new Date().toISOString(),
            metadata: {
              browser: navigator.userAgent,
            },
          };

          setError(stallError.error);
          setProcessingError(stallError);
          stopPolling();
        }
      }
    } catch {
      consecutiveFailuresRef.current += 1;

      // Tolerate transient network blips — only error after several consecutive failures
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        const message =
          "Unable to check transcription progress. Please check your connection and try again.";
        setError(message);
        setProcessingError({
          stage: "polling",
          error: message,
          code: "POLL_NETWORK_ERROR",
          occurredAt: new Date().toISOString(),
          metadata: {
            browser: navigator.userAgent,
          },
        });
        stopPolling();
      }
    }
  }, [sessionId, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setStatus("pending");
    setError(null);
    setProcessingError(null);
    lastStatusChangeRef.current = { status: "pending", at: Date.now() };
    consecutiveFailuresRef.current = 0;
  }, [stopPolling]);

  // Auto-start polling when a sessionId is provided
  useEffect(() => {
    if (sessionId) {
      lastStatusChangeRef.current = { status: "pending", at: Date.now() };
      setIsPolling(true);
      poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL);
    }
    return stopPolling;
  }, [sessionId, poll, stopPolling]);

  return { status, error, processingError, isPolling, reset };
}
