"use client";

import { useLayoutEffect, useRef } from "react";

interface NoteSection {
  key: string;
  label: string;
  value: string;
}

interface NoteDocumentEditorProps {
  sections: NoteSection[];
  editedContent: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  disabled: boolean;
}

function AutoResizeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="w-full resize-none overflow-hidden border-none bg-transparent p-0 text-base leading-relaxed text-foreground outline-none focus:ring-0 disabled:cursor-default disabled:opacity-100"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      value={value}
    />
  );
}

export function NoteDocumentEditor({
  sections,
  editedContent,
  onFieldChange,
  disabled,
}: NoteDocumentEditorProps) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg bg-white px-10 py-8 shadow-sm dark:bg-zinc-900 dark:shadow-zinc-800/30">
      <div className="prose dark:prose-invert max-w-none">
      {sections.map((section, index) => (
        <div key={section.key}>
          <h3
            className={`text-base font-semibold tracking-wide text-foreground mb-2 ${index === 0 ? "mt-0" : "mt-6"}`}
          >
            {section.label}
          </h3>
          <AutoResizeField
            value={editedContent[section.key] ?? section.value}
            onChange={(v) => onFieldChange(section.key, v)}
            disabled={disabled}
          />
        </div>
      ))}
      </div>
    </div>
  );
}
