"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProcessingError } from "@/lib/db/types";

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0)
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

function getSupportedMimeType(): string | null {
  for (const mimeType of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return null;
}

interface StopResult {
  blob: Blob;
  duration: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingError, setProcessingError] =
    useState<ProcessingError | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPromiseRef = useRef<{
    resolve: (result: StopResult) => void;
  } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquireWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Wake lock request can fail (e.g. low battery on some devices) — non-critical
        console.warn("[audio-recorder] Wake lock request failed");
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearTimer();
    releaseWakeLock();
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    chunksRef.current = [];
  }, [clearTimer, releaseWakeLock]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isRecording && !isPaused) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isRecording, isPaused, acquireWakeLock]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    setProcessingError(null);

    if (typeof MediaRecorder === "undefined") {
      setError("Audio recording is not supported in this browser.");
      return false;
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setError("Audio recording is not supported in this browser.");
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
    } catch {
      const message =
        "Microphone access denied. Please allow microphone access in your browser settings.";
      setError(message);
      setProcessingError({
        stage: "mic_access",
        error: message,
        code: "MIC_DENIED",
        occurredAt: new Date().toISOString(),
        metadata: {
          browser: navigator.userAgent,
        },
      });
      return false;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mediaRecorder.mimeType,
      });
      if (stopPromiseRef.current) {
        stopPromiseRef.current.resolve({ blob, duration });
        stopPromiseRef.current = null;
      }
    };

    mediaRecorder.onerror = () => {
      const message = "Recording failed unexpectedly. Please try again.";
      setError(message);
      setProcessingError({
        stage: "recording",
        error: message,
        code: "MEDIA_RECORDER_ERROR",
        occurredAt: new Date().toISOString(),
        metadata: {
          audioMimeType: mimeType,
          browser: navigator.userAgent,
        },
      });
      cleanup();
      setIsRecording(false);
      setIsPaused(false);
    };

    mediaRecorder.start();
    setIsRecording(true);
    setIsPaused(false);
    setDuration(0);
    acquireWakeLock();

    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    return true;
  }, [duration, acquireWakeLock, cleanup]);

  const stopRecording = useCallback((): Promise<StopResult> => {
    return new Promise<StopResult>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        const blob = new Blob(chunksRef.current, {
          type: recorder?.mimeType ?? "audio/webm",
        });
        resolve({ blob, duration });
        return;
      }

      stopPromiseRef.current = { resolve };

      // Capture duration before clearing state, since onstop fires async
      const finalDuration = duration;
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (stopPromiseRef.current) {
          stopPromiseRef.current.resolve({ blob, duration: finalDuration });
          stopPromiseRef.current = null;
        }

        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            track.stop();
          }
          streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        chunksRef.current = [];
      };

      clearTimer();
      releaseWakeLock();
      recorder.stop();
      setIsRecording(false);
      setIsPaused(false);
    });
  }, [duration, clearTimer, releaseWakeLock]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.pause();
      clearTimer();
      releaseWakeLock();
      setIsPaused(true);
    }
  }, [clearTimer, releaseWakeLock]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "paused") {
      recorder.resume();
      acquireWakeLock();
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
      setIsPaused(false);
    }
  }, [acquireWakeLock]);

  const cancelRecording = useCallback(() => {
    cleanup();
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setError(null);
    setProcessingError(null);
  }, [cleanup]);

  return {
    isRecording,
    isPaused,
    duration,
    error,
    processingError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
  };
}
