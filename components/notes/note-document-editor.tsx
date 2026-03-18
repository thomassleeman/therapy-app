"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";


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
      className="w-full resize-none overflow-hidden border-none bg-transparent p-0 text-base leading-relaxed text-foreground outline-none focus:ring-0 disabled:cursor-default disabled:opacity-100"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      ref={ref}
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
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = sections
      .map((s) => `${s.label}\n${editedContent[s.key] ?? s.value}`)
      .join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [sections, editedContent]);

  return (
    <div className="mx-auto max-w-3xl space-y-2">
      <div className="flex justify-end">
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={handleCopy}
          type="button"
        >
          {copied ? (
            <>
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span className="text-green-600 dark:text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-4" />
              <span>Copy notes</span>
            </>
          )}
        </button>
      </div>
      <div className="rounded-lg bg-white px-10 py-8 shadow-sm dark:bg-zinc-900 dark:shadow-zinc-800/30">
        <div className="prose dark:prose-invert max-w-none">
          {sections.map((section, index) => (
            <div key={section.key}>
              <h3
                className={`text-base font-semibold tracking-wide text-foreground mb-2 ${index === 0 ? "mt-0" : "mt-6"}`}
              >
                {section.label}
              </h3>
              <AutoResizeField
                disabled={disabled}
                onChange={(v) => onFieldChange(section.key, v)}
                value={editedContent[section.key] ?? section.value}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
