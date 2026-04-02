"use client";

import { Check, ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { useCopyToClipboard } from "usehooks-ts";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { ProcessingError } from "@/lib/db/types";

interface CopyErrorReportProps {
  sessionId: string;
  processingError: ProcessingError;
}

function buildReport(sessionId: string, pe: ProcessingError): string {
  const lines: string[] = [
    "--- Pasu Health Error Report ---",
    `Session: ${sessionId}`,
    `Stage: ${pe.stage}`,
    `Error: ${pe.error}`,
  ];

  if (pe.code) lines.push(`Code: ${pe.code}`);
  lines.push(`Time: ${pe.occurredAt}`);
  if (pe.detail) lines.push(`Detail: ${pe.detail}`);

  if (pe.metadata) {
    const m = pe.metadata;
    if (m.browser) lines.push(`Browser: ${m.browser}`);
    if (m.audioMimeType) lines.push(`Audio format: ${m.audioMimeType}`);
    if (m.audioDurationSec != null)
      lines.push(`Audio duration: ${m.audioDurationSec}s`);
    if (m.audioSizeBytes != null)
      lines.push(
        `Audio size: ${(m.audioSizeBytes / 1024 / 1024).toFixed(1)} MB`
      );
    if (m.transcriptionProvider)
      lines.push(`Provider: ${m.transcriptionProvider}`);
    if (m.httpStatus != null) lines.push(`HTTP status: ${m.httpStatus}`);
  }

  lines.push("--- End Report ---");
  return lines.join("\n");
}

export function CopyErrorReport({
  sessionId,
  processingError,
}: CopyErrorReportProps) {
  const [, copyToClipboard] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const report = buildReport(sessionId, processingError);
    await copyToClipboard(report);
    toast({ type: "success", description: "Copied to clipboard" });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      className="text-xs gap-1.5 cursor-pointer px-3 py-2 rounded-md border border-gray-300 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600"
      onClick={handleCopy}
      size="sm"
      variant="ghost"
    >
      {copied ? (
        <Check className="size-3.5" />
      ) : (
        <ClipboardCopy className="size-3.5" />
      )}
      {copied ? "Copied" : "Copy error report"}
    </Button>
  );
}
