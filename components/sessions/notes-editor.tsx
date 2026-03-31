"use client";

import { Lock } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { NoteStatus } from "@/lib/db/types";

interface NotesEditorProps {
  noteText: string;
  onNoteTextChange: (text: string) => void;
  noteStatus: NoteStatus;
  noteFormat: string;
}

export function NotesEditor({
  noteText,
  onNoteTextChange,
  noteStatus,
}: NotesEditorProps) {
  const isFinalised = noteStatus === "finalised";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: noteText must trigger resize when content changes externally (e.g. AI tool calls)
  useEffect(() => {
    adjustHeight();
  }, [noteText, adjustHeight]);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6">
      {noteStatus === "draft" && (
        <div className="mb-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          AI-generated draft &mdash; please review before finalising.
        </div>
      )}

      {isFinalised && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          These notes have been finalised and are locked for editing.
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <textarea
          className="min-h-[400px] w-full resize-none overflow-hidden border-none bg-transparent p-2 font-mono text-sm leading-relaxed text-foreground outline-none focus:ring-0 disabled:cursor-default disabled:opacity-60"
          disabled={isFinalised}
          onChange={(e) => {
            onNoteTextChange(e.target.value);
            adjustHeight();
          }}
          ref={textareaRef}
          value={noteText}
        />
      </div>
    </div>
  );
}
