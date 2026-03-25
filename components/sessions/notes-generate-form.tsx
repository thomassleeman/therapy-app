"use client";

import { FileText, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ClinicalNote,
  NoteFormat,
  TranscriptionStatus,
} from "@/lib/db/types";
import { showErrorToast } from "@/lib/errors/client-error-handler";
import { FORMAT_DESCRIPTIONS } from "@/lib/notes/format-config";

interface NotesGenerateFormProps {
  sessionId: string;
  transcriptionStatus: TranscriptionStatus;
  onNotesGenerated: (note: ClinicalNote) => void;
}

export function NotesGenerateForm({
  sessionId,
  transcriptionStatus,
  onNotesGenerated,
}: NotesGenerateFormProps) {
  const [selectedFormat, setSelectedFormat] = useState<NoteFormat>("soap");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/notes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          noteFormat: selectedFormat,
          additionalContext: additionalContext || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate notes");
      }

      const note = await res.json().catch(() => null);
      if (!note) {
        throw new Error("Received an invalid response from the server.");
      }
      onNotesGenerated(note);
    } catch (err) {
      showErrorToast(err, "Failed to generate notes. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [sessionId, selectedFormat, additionalContext, onNotesGenerated]);

  if (
    transcriptionStatus !== "completed" &&
    transcriptionStatus !== "not_applicable"
  ) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <FileText className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Notes can be generated after the transcript is complete.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">
          Generate Clinical Notes
        </h3>
        <p className="text-sm text-muted-foreground">
          Select a note format and our AI will generate a draft from your
          session transcript for review.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.entries(FORMAT_DESCRIPTIONS) as [NoteFormat, string][]).map(
          ([format, desc]) => (
            <label
              className={`flex cursor-pointer flex-col rounded-lg border p-4 transition-colors ${
                selectedFormat === format
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted"
              }`}
              key={format}
            >
              <input
                checked={selectedFormat === format}
                className="sr-only"
                name="note-format"
                onChange={() => setSelectedFormat(format)}
                type="radio"
                value={format}
              />
              <span className="text-sm font-medium uppercase">{format}</span>
              <span className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {desc}
              </span>
            </label>
          )
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="additional-context">
          Additional therapist observations (optional)
        </Label>
        <Textarea
          id="additional-context"
          onChange={(e) => setAdditionalContext(e.target.value)}
          placeholder="Add any observations not captured in the transcript, e.g. non-verbal cues, your clinical impressions..."
          rows={3}
          value={additionalContext}
        />
      </div>

      <Button
        className="w-full min-h-12"
        disabled={generating}
        onClick={handleGenerate}
        size="lg"
      >
        {generating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Generating clinical notes... This may take up to a minute.
          </>
        ) : (
          <>
            <FileText className="size-4" />
            Generate Notes
          </>
        )}
      </Button>
    </div>
  );
}
