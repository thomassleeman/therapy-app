"use client";

import { AlertCircle, Check, FileAudio, Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/hooks/use-audio-recorder";
import { useTranscriptionStatus } from "@/hooks/use-transcription-status";

const ACCEPTED_TYPES = [".wav", ".mp3", ".m4a", ".webm", ".ogg"];
const ACCEPTED_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
];
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

type UploadPhase =
  | "idle"
  | "selected"
  | "uploading"
  | "processing"
  | "completed"
  | "error";

interface SelectedFile {
  file: File;
  name: string;
  sizeFormatted: string;
  duration: string;
}

interface AudioUploadProps {
  sessionId: string;
  onComplete: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getAudioDuration(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();
    return formatDuration(Math.round(audioBuffer.duration));
  } catch {
    return "Calculated after upload";
  }
}

export function AudioUpload({ sessionId, onComplete }: AudioUploadProps) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    status: transcriptionStatus,
    error: transcriptionError,
    startPolling,
    reset: resetTranscription,
  } = useTranscriptionStatus(sessionId);

  const handleFileSelect = useCallback(async (file: File) => {
    setErrorMessage(null);

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setErrorMessage(
        `Unsupported file type. Accepted formats: ${ACCEPTED_TYPES.join(", ")}`
      );
      setPhase("error");
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage("File is too large. Maximum size is 500MB.");
      setPhase("error");
      return;
    }

    const duration = await getAudioDuration(file);

    setSelectedFile({
      file,
      name: file.name,
      sizeFormatted: formatFileSize(file.size),
      duration,
    });
    setPhase("selected");
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setPhase("uploading");
    setUploadProgress(0);

    try {
      const uploaded = await new Promise<boolean>((resolve) => {
        const formData = new FormData();
        formData.append("audioFile", selectedFile.file, selectedFile.name);
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
              if (resp.error) message = resp.error;
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

      if (!uploaded) return;

      setPhase("processing");

      const processResponse = await fetch("/api/transcription/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!processResponse.ok) {
        const data = await processResponse.json().catch(() => ({}));
        setErrorMessage(
          data.error ?? "Failed to start transcription processing"
        );
        setPhase("error");
        return;
      }

      startPolling();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setPhase("error");
    }
  }, [selectedFile, sessionId, startPolling]);

  const handleReset = useCallback(() => {
    resetTranscription();
    setPhase("idle");
    setSelectedFile(null);
    setErrorMessage(null);
    setUploadProgress(0);
    setIsDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [resetTranscription]);

  // Sync transcription status with phase
  const currentPhase = (() => {
    if (transcriptionStatus === "completed") return "completed";
    if (transcriptionStatus === "failed") return "error";
    return phase;
  })();

  // Call onComplete when transcription finishes
  if (currentPhase === "completed" && phase !== "completed") {
    setPhase("completed");
    onComplete();
  }

  const displayError = errorMessage ?? transcriptionError;

  if (currentPhase === "error") {
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
          <div className="flex items-center gap-2 text-green-600">
            <Check className="size-5" />
            <p className="text-sm font-medium">Transcription complete!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentPhase === "processing") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Transcribing session...</p>
            <p className="text-xs text-muted-foreground">
              This usually takes 2-4 minutes for a 50-minute session.
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

  if (currentPhase === "selected" && selectedFile) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3 w-full max-w-sm">
            <FileAudio className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedFile.sizeFormatted} &middot; Duration:{" "}
                {selectedFile.duration}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              className="min-h-12"
              onClick={handleReset}
              size="lg"
              variant="outline"
            >
              Choose Different File
            </Button>
            <Button
              className="min-h-12 min-w-[180px]"
              onClick={handleUpload}
              size="lg"
            >
              <Upload className="size-4" />
              Upload &amp; Transcribe
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Idle / drop zone state
  return (
    <Card>
      <CardContent className="py-8">
        <input
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={handleInputChange}
          ref={fileInputRef}
          type="file"
        />

        <button
          className={`w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          type="button"
        >
          <Upload className="mx-auto size-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">
            Drag and drop an audio file, or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Accepted formats: {ACCEPTED_TYPES.join(", ")} &middot; Max size:
            500MB
          </p>
        </button>
      </CardContent>
    </Card>
  );
}
