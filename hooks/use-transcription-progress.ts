"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TranscriptionStatus } from "@/hooks/use-transcription-status";
import { useTranscriptionStatus } from "@/hooks/use-transcription-status";

/** Whisper processes at roughly 7× real-time speed for typical therapy audio. */
export const PROCESSING_SPEED_RATIO = 7;

const MIN_ESTIMATE_SECONDS = 15;
const MAX_ESTIMATE_SECONDS = 600;
const DEFAULT_ESTIMATE_SECONDS = 120;
const TICK_INTERVAL_MS = 250;
const PROGRESS_CAP = 90;

export function formatRemainingTime(seconds: number): string {
  if (seconds <= 60) return "Less than a minute remaining";
  const minutes = Math.round(seconds / 60);
  return `~${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
}

function estimateTotalSeconds(audioDurationSeconds: number | null): number {
  if (audioDurationSeconds === null) return DEFAULT_ESTIMATE_SECONDS;
  const raw = audioDurationSeconds / PROCESSING_SPEED_RATIO;
  return Math.min(MAX_ESTIMATE_SECONDS, Math.max(MIN_ESTIMATE_SECONDS, raw));
}

/** Ease-out curve: fast start, gradual slowdown. */
function easeOut(t: number): number {
  return t * (2 - t);
}

/** Round to nearest 5 seconds. */
function roundTo5(seconds: number): number {
  return Math.round(seconds / 5) * 5;
}

interface UseTranscriptionProgressReturn {
  progress: number;
  status: TranscriptionStatus;
  error: string | null;
  isPolling: boolean;
  estimatedRemainingSeconds: number | null;
  startPolling: () => void;
  reset: () => void;
}

export function useTranscriptionProgress(
  sessionId: string | null,
  audioDurationSeconds: number | null,
): UseTranscriptionProgressReturn {
  const {
    status,
    error,
    isPolling,
    startPolling,
    reset: resetTranscription,
  } = useTranscriptionStatus(sessionId);

  const [progress, setProgress] = useState(0);
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState<
    number | null
  >(null);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const estimatedTotalRef = useRef(
    estimateTotalSeconds(audioDurationSeconds),
  );

  // Update estimate when audioDurationSeconds changes
  useEffect(() => {
    estimatedTotalRef.current = estimateTotalSeconds(audioDurationSeconds);
  }, [audioDurationSeconds]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    startTimeRef.current = null;
    setProgress(0);
    setEstimatedRemainingSeconds(null);
    resetTranscription();
  }, [clearTimer, resetTranscription]);

  // Start timer when status transitions to 'processing'
  useEffect(() => {
    if (status === "processing") {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      clearTimer();
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current === null) return;

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const total = estimatedTotalRef.current;
        const rawProgress = Math.min(1, elapsed / total);
        const eased = easeOut(rawProgress);
        const cappedPercent = Math.min(PROGRESS_CAP, eased * 100);

        setProgress(cappedPercent);

        if (rawProgress < 0.9) {
          const remaining = Math.max(0, total - elapsed);
          setEstimatedRemainingSeconds(roundTo5(remaining));
        } else {
          setEstimatedRemainingSeconds(null);
        }
      }, TICK_INTERVAL_MS);

      return clearTimer;
    }

    if (status === "completed") {
      clearTimer();
      setProgress(100);
      setEstimatedRemainingSeconds(null);
    }

    if (status === "failed") {
      clearTimer();
      setEstimatedRemainingSeconds(null);
      // Freeze progress at current value — no setProgress call
    }
  }, [status, clearTimer]);

  // Reset when sessionId changes
  useEffect(() => {
    if (sessionId === null) {
      clearTimer();
      startTimeRef.current = null;
      setProgress(0);
      setEstimatedRemainingSeconds(null);
    }
  }, [sessionId, clearTimer]);

  return {
    progress,
    status,
    error,
    isPolling,
    estimatedRemainingSeconds,
    startPolling,
    reset,
  };
}
