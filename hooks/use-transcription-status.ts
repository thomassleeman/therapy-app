"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TranscriptionStatus } from "@/lib/db/types";

interface UseTranscriptionStatusReturn {
  status: TranscriptionStatus;
  error: string | null;
  isPolling: boolean;
  reset: () => void;
}

const POLL_INTERVAL = 5000;

export function useTranscriptionStatus(
  sessionId: string | null
): UseTranscriptionStatusReturn {
  const [status, setStatus] = useState<TranscriptionStatus>("pending");
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
      const transcriptionStatus = data.session
        ?.transcriptionStatus as TranscriptionStatus;

      if (transcriptionStatus) {
        setStatus(transcriptionStatus);
      }

      if (
        transcriptionStatus === "completed" ||
        transcriptionStatus === "failed"
      ) {
        if (transcriptionStatus === "failed") {
          setError(data.session?.errorMessage ?? "Transcription failed");
        }
        stopPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check status");
      stopPolling();
    }
  }, [sessionId, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setStatus("pending");
    setError(null);
  }, [stopPolling]);

  // Auto-start polling when a sessionId is provided
  useEffect(() => {
    if (sessionId) {
      setIsPolling(true);
      poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL);
    }
    return stopPolling;
  }, [sessionId, poll, stopPolling]);

  return { status, error, isPolling, reset };
}
