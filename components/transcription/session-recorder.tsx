"use client";

import {
  AlertCircle,
  Check,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDuration, useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useTranscriptionProgress } from "@/hooks/use-transcription-progress";

type RecorderPhase =
  | "ready"
  | "recording"
  | "uploading"
  | "processing"
  | "completed"
  | "error";

interface SessionRecorderProps {
  sessionId: string;
  onComplete: () => void;
  onStart?: () => void;
}

export function SessionRecorder({
  sessionId,
  onComplete,
  onStart,
}: SessionRecorderProps) {
  const {
    isRecording,
    isPaused,
    duration,
    error: recorderError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
  } = useAudioRecorder();

  const [phase, setPhase] = useState<RecorderPhase>("ready");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processSessionId, setProcessSessionId] = useState<string | null>(null);
  const onStartCalledRef = useRef(false);

  const {
    progress: transcriptionProgress,
    status: transcriptionStatus,
    label: transcriptionLabel,
    error: transcriptionError,
  } = useTranscriptionProgress(processSessionId);

  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    await startRecording();
    setPhase("recording");
    if (!onStartCalledRef.current) {
      onStartCalledRef.current = true;
      onStart?.();
    }
  }, [startRecording, onStart]);

  const handleStop = useCallback(async () => {
    try {
      const { blob } = await stopRecording();
      setPhase("uploading");
      setUploadProgress(0);

      // Upload via XMLHttpRequest for progress tracking
      const uploaded = await new Promise<boolean>((resolve) => {
        const formData = new FormData();
        formData.append("audioFile", blob, `session-${sessionId}.webm`);
        formData.append("sessionId", sessionId);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/transcription/upload");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
          } else {
            let message = "Upload failed";
            try {
              const resp = JSON.parse(xhr.responseText);
              if (resp.error) {
                message = resp.error;
              }
            } catch {
              // use default message
            }
            setErrorMessage(message);
            setPhase("error");
            resolve(false);
          }
        };

        xhr.onerror = () => {
          setErrorMessage(
            "Network error during upload. Please check your connection."
          );
          setPhase("error");
          resolve(false);
        };

        xhr.send(formData);
      });

      if (!uploaded) {
        return;
      }

      // Fire and forget — polling will track real progress via DB status
      setPhase("processing");
      setProcessSessionId(sessionId);

      fetch("/api/transcription/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch((err) => {
        console.error("[transcription] Process request failed:", err);
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setPhase("error");
    }
  }, [stopRecording, sessionId]);

  const handleReset = useCallback(() => {
    cancelRecording();
    setProcessSessionId(null);
    setPhase("ready");
    setErrorMessage(null);
    setUploadProgress(0);
  }, [cancelRecording]);

  // Sync transcription status with phase
  const currentPhase = (() => {
    if (transcriptionStatus === "completed") {
      return "completed";
    }
    if (transcriptionStatus === "failed") {
      return "error";
    }
    if (phase === "recording" && isRecording) {
      return "recording";
    }
    return phase;
  })();

  // Call onComplete when transcription finishes (in useEffect to avoid setState during render)
  useEffect(() => {
    if (currentPhase === "completed" && phase !== "completed") {
      setPhase("completed");
      onComplete();
    }
  }, [currentPhase, phase, onComplete]);

  // Sync transcription errors
  const displayError = errorMessage ?? transcriptionError ?? recorderError;

  if (currentPhase === "error" || (recorderError && currentPhase === "ready")) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            <p className="text-sm font-medium">{displayError}</p>
          </div>
          <Button
            className="min-h-12 min-w-[160px]"
            onClick={handleReset}
            size="lg"
            variant="outline"
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (currentPhase === "completed") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="w-full max-w-xs space-y-3">
            <Progress value={100} />
            <div className="flex items-center justify-center gap-2 text-green-600">
              <Check className="size-4" />
              <p className="text-sm font-medium">Transcription complete!</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentPhase === "processing") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="w-full max-w-xs space-y-3">
            <Progress value={transcriptionProgress} />
            <p className="text-xs text-muted-foreground text-center">
              {transcriptionLabel}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentPhase === "uploading") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <div className="w-full max-w-xs space-y-2">
            <p className="text-sm font-medium text-center">
              Uploading audio...
            </p>
            <Progress value={uploadProgress} />
            <p className="text-xs text-muted-foreground text-center">
              {uploadProgress}%
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentPhase === "recording") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex items-center gap-3">
            {isPaused ? (
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Paused
              </span>
            ) : (
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-red-500" />
              </span>
            )}
            <span className="text-2xl font-mono tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>

          {!isPaused && (
            <p className="text-xs text-muted-foreground">
              Recording in progress...
            </p>
          )}

          <div className="flex items-center gap-3">
            {isPaused ? (
              <Button
                className="min-h-12 min-w-[120px]"
                onClick={resumeRecording}
                size="lg"
                variant="outline"
              >
                <Play className="size-4" />
                Resume
              </Button>
            ) : (
              <Button
                className="min-h-12 min-w-[120px]"
                onClick={pauseRecording}
                size="lg"
                variant="outline"
              >
                <Pause className="size-4" />
                Pause
              </Button>
            )}
            <Button
              className="min-h-12 min-w-[160px]"
              onClick={handleStop}
              size="lg"
              variant="destructive"
            >
              <Square className="size-4" />
              Stop Recording
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Ready state
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-8">
        <Button
          className="min-h-14 min-w-[200px] text-base"
          onClick={handleStart}
          size="lg"
        >
          <Mic className="size-5" />
          Start Recording
        </Button>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Audio is recorded locally on your device during the session.
          Transcription begins after you stop recording.
        </p>
      </CardContent>
    </Card>
  );
}
