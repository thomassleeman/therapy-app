"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TranscriptionStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";

interface UseTranscriptionStatusReturn {
  status: TranscriptionStatus;
  error: string | null;
  isPolling: boolean;
  startPolling: () => void;
  reset: () => void;
}

const POLL_INTERVAL = 5000;

export function useTranscriptionStatus(
  sessionId: string | null
): UseTranscriptionStatusReturn {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const transcriptionStatus = data.session?.transcriptionStatus as string;

      if (transcriptionStatus === "completed") {
        setStatus("completed");
        stopPolling();
      } else if (transcriptionStatus === "failed") {
        setStatus("failed");
        setError(data.session?.errorMessage ?? "Transcription failed");
        stopPolling();
      }
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Failed to check status");
      stopPolling();
    }
  }, [sessionId, stopPolling]);

  const startPolling = useCallback(() => {
    if (!sessionId) {
      return;
    }
    setStatus("processing");
    setIsPolling(true);

    // Poll immediately, then on interval
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
  }, [sessionId, poll]);

  const reset = useCallback(() => {
    stopPolling();
    setStatus("idle");
    setError(null);
  }, [stopPolling]);

  // Auto-start polling when a sessionId is provided
  useEffect(() => {
    if (sessionId) {
      setStatus("processing");
      setIsPolling(true);
      poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL);
    }
    return stopPolling;
  }, [sessionId, poll, stopPolling]);

  return { status, error, isPolling, startPolling, reset };
}
