"use client";

import { Lock } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { NoteFormat, NoteStatus } from "@/lib/db/types";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/notes/format-config";

interface NotesEditorProps {
  noteFormat: NoteFormat;
  noteStatus: NoteStatus;
  noteContent: Record<string, string>;
  highlightedSections: Set<string>;
  onFieldChange: (key: string, value: string) => void;
}

function SectionTextarea({
  value,
  onChange,
  disabled,
  highlighted,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  highlighted: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: value must trigger resize when content changes externally (e.g. AI tool calls)
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <div
      className={`rounded-md transition-all duration-300 ${
        highlighted ? "ring-2 ring-primary/40 bg-primary/5" : ""
      }`}
    >
      <textarea
        className="w-full resize-none overflow-hidden border-none bg-transparent p-2 text-base leading-relaxed text-foreground outline-none focus:ring-0 disabled:cursor-default disabled:opacity-60"
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          adjustHeight();
        }}
        ref={textareaRef}
        value={value}
      />
    </div>
  );
}

export function NotesEditor({
  noteFormat,
  noteStatus,
  noteContent,
  highlightedSections,
  onFieldChange,
}: NotesEditorProps) {
  const isFinalised = noteStatus === "finalised";

  const orderedKeys = SECTION_ORDER[noteFormat] ?? [];
  const contentKeys = Object.keys(noteContent);
  const extraKeys = contentKeys.filter((k) => !orderedKeys.includes(k));
  const sectionKeys = [
    ...orderedKeys.filter((k) => k in noteContent),
    ...extraKeys,
  ];

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

      <div className="space-y-6 bg-white rounded-lg shadow-sm p-6">
        {sectionKeys.map((key) => (
          <div key={key}>
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-foreground">
              {SECTION_LABELS[key] ?? key}
            </h3>
            <SectionTextarea
              disabled={isFinalised}
              highlighted={highlightedSections.has(key)}
              onChange={(v: string) => onFieldChange(key, v)}
              value={noteContent[key] ?? ""}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
