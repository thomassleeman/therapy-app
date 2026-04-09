"use client";

import { FileText, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type {
  ClinicalNote,
  CustomNoteFormat,
  NoteFormat,
  TranscriptionStatus,
} from "@/lib/db/types";
import { showErrorToast } from "@/lib/errors/client-error-handler";
import { FORMAT_DESCRIPTIONS } from "@/lib/notes/format-config";

interface NotesGenerateFormProps {
  sessionId: string;
  transcriptionStatus: TranscriptionStatus;
  onNotesGenerated: (note: ClinicalNote, commentary?: string) => void;
}

export function NotesGenerateForm({
  sessionId,
  transcriptionStatus,
  onNotesGenerated,
}: NotesGenerateFormProps) {
  const [selectedFormat, setSelectedFormat] = useState<string>("soap");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [customFormats, setCustomFormats] = useState<CustomNoteFormat[]>([]);

  // Fetch custom formats
  useEffect(() => {
    async function fetchCustomFormats() {
      try {
        const res = await fetch("/api/settings/note-formats");
        if (res.ok) {
          const data = await res.json();
          setCustomFormats(Array.isArray(data) ? data : []);
        }
      } catch {
        // Custom formats unavailable — show built-in only
      }
    }
    fetchCustomFormats();
  }, []);

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

      const data = await res.json().catch(() => null);
      if (!data) {
        throw new Error("Received an invalid response from the server.");
      }
      const { commentary, ...note } = data;
      onNotesGenerated(note, commentary);
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

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Custom
        </span>
        <Separator className="flex-1" />
      </div>

      <div className="flex justify-start">
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
          href="/settings/note-formats"
        >
          <Plus className="size-3" />
          Create a new format
        </Link>
      </div>

      {customFormats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {customFormats.map((cf) => {
            const value = `custom:${cf.id}`;
            const sectionPreview = cf.sections.map((s) => s.label).join(", ");
            return (
              <label
                className={`flex cursor-pointer flex-col rounded-lg border p-4 transition-colors ${
                  selectedFormat === value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                key={cf.id}
              >
                <input
                  checked={selectedFormat === value}
                  className="sr-only"
                  name="note-format"
                  onChange={() => setSelectedFormat(value)}
                  type="radio"
                  value={value}
                />
                <span className="text-sm font-medium">{cf.name}</span>
                <span className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {sectionPreview}
                </span>
              </label>
            );
          })}
        </div>
      )}

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
