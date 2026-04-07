"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ClinicalDocumentWithReferences } from "@/lib/db/types";
import type { DocumentTypeConfig } from "@/lib/documents/types";
import {
  extractErrorMessage,
  showErrorToast,
} from "@/lib/errors/client-error-handler";

interface Props {
  document: ClinicalDocumentWithReferences;
  typeConfig: DocumentTypeConfig;
  clientId: string;
  clientName: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  draft: "bg-amber-600 text-white dark:bg-amber-900/30 dark:text-amber-400",
  reviewed: "bg-blue-600 text-white dark:bg-blue-900/30 dark:text-blue-400",
  finalised: "bg-green-600 text-white dark:bg-green-900/30 dark:text-green-400",
};

function ReferenceIcon({ type }: { type: string }) {
  switch (type) {
    case "session":
      return <MessageSquare className="size-4 shrink-0" />;
    case "clinical_document":
      return <FileText className="size-4 shrink-0" />;
    default:
      return <FileText className="size-4 shrink-0" />;
  }
}

function referenceLabel(type: string): string {
  switch (type) {
    case "session":
      return "Session";
    case "clinical_note":
      return "Progress Note";
    case "clinical_document":
      return "Document";
    default:
      return "Reference";
  }
}

function AutoResizeTextarea({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

  return (
    <Textarea
      className="resize-none overflow-hidden"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      ref={textareaRef}
      rows={3}
      value={value}
    />
  );
}

export function DocumentViewer({
  document: initialDocument,
  typeConfig,
  clientId,
  clientName,
}: Props) {
  const router = useRouter();
  const [document, setDocument] = useState(initialDocument);
  const [editedContent, setEditedContent] = useState<Record<string, string>>(
    {}
  );
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);

  const isEditable =
    document.status === "draft" || document.status === "reviewed";
  const isDirty = Object.keys(editedContent).length > 0 || editedTitle !== null;

  const updateField = (key: string, value: string) => {
    setEditedContent((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};

      if (Object.keys(editedContent).length > 0) {
        body.content = { ...document.content, ...editedContent };
      }
      if (editedTitle !== null) {
        body.title = editedTitle;
      }

      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = await res.json().catch(() => null);
        if (!updated) {
          throw new Error("Received an invalid response from the server.");
        }
        setDocument((prev) => ({ ...prev, ...updated }));
        setEditedContent({});
        setEditedTitle(null);
        toast({ type: "success", description: "Document saved." });
      } else {
        const message = await extractErrorMessage(
          res,
          "Failed to save document. Please try again."
        );
        toast({ type: "error", description: message });
      }
    } catch (err) {
      showErrorToast(err, "Failed to save document. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [document, editedContent, editedTitle]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({ type: "success", description: "Document deleted." });
        router.push(`/clients/${clientId}`);
      } else {
        const message = await extractErrorMessage(
          res,
          "Failed to delete document. Please try again."
        );
        toast({ type: "error", description: message });
      }
    } catch (err) {
      showErrorToast(err, "Failed to delete document. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [document.id, clientId, router]);

  const handleStatusUpdate = useCallback(
    async (status: "reviewed" | "finalised") => {
      setSaving(true);
      try {
        const body: Record<string, unknown> = { status };
        if (status === "reviewed") {
          body.reviewedAt = new Date().toISOString();
        }

        const res = await fetch(`/api/documents/${document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const updated = await res.json().catch(() => null);
          if (!updated) {
            throw new Error("Received an invalid response from the server.");
          }
          setDocument((prev) => ({ ...prev, ...updated }));
          router.refresh();
        } else {
          const message = await extractErrorMessage(
            res,
            "Failed to update document status. Please try again."
          );
          toast({ type: "error", description: message });
        }
      } catch (err) {
        showErrorToast(
          err,
          "Failed to update document status. Please try again."
        );
      } finally {
        setSaving(false);
        setConfirmFinalise(false);
      }
    },
    [document.id, router]
  );

  return (
    <TooltipProvider>
      {/* Header */}
      <header className="bg-background border-b px-4 py-4 md:px-6">
        <div className="mb-3">
          <Link
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            href={`/clients/${clientId}`}
          >
            &larr; {clientName}
          </Link>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {isEditable ? (
              <input
                className="text-2xl font-semibold tracking-tight bg-transparent border-none outline-none w-full focus:ring-0 p-0"
                onChange={(e) => setEditedTitle(e.target.value)}
                type="text"
                value={editedTitle ?? document.title}
              />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">
                {document.title}
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge className="hover:bg-inherit" variant="outline">
                {typeConfig.label}
              </Badge>
              <Badge
                className={`hover:bg-inherit ${STATUS_BADGE_STYLES[document.status] ?? ""}`}
              >
                {document.status.charAt(0).toUpperCase() +
                  document.status.slice(1)}
              </Badge>
              {document.version > 1 && (
                <span className="text-xs">v{document.version}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatDate(document.createdAt)}
              {document.updatedAt !== document.createdAt &&
                ` \u00B7 Updated ${formatDateTime(document.updatedAt)}`}
            </p>
          </div>

          {(document.status === "reviewed" ||
            document.status === "finalised") && (
            <Button
              className="shrink-0"
              onClick={async () => {
                try {
                  const res = await fetch(
                    `/api/documents/${document.id}/export`
                  );
                  if (!res.ok) {
                    toast({
                      type: "error",
                      description:
                        "Failed to export document. Please try again.",
                    });
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const link = window.document.createElement("a");
                  link.href = url;
                  const disposition = res.headers.get("Content-Disposition");
                  const filenameMatch = disposition?.match(/filename="(.+)"/);
                  link.download = filenameMatch?.[1] ?? "document.docx";
                  link.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  showErrorToast(
                    err,
                    "Failed to export document. Please try again."
                  );
                }
              }}
              size="sm"
              variant="outline"
            >
              <Download className="size-4" />
              Export as Word
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 md:px-6 space-y-6 max-w-4xl">
        {/* AI Warning Banner */}
        {document.status === "draft" && document.generatedBy === "ai" && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-4 py-3">
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              This document was generated by AI and requires clinical review
              before finalising. Please verify all content against your clinical
              records.
            </p>
          </div>
        )}

        {/* References Section */}
        {document.references.length > 0 && (
          <div className="rounded-lg border">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              onClick={() => setReferencesOpen(!referencesOpen)}
              type="button"
            >
              <span>
                Based on {document.references.length} source
                {document.references.length === 1 ? "" : "s"}
              </span>
              {referencesOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
            {referencesOpen && (
              <div className="border-t px-4 py-3 space-y-2">
                {document.references.map((ref) => {
                  const label = referenceLabel(ref.referenceType);
                  const date = formatDate(ref.createdAt);

                  let href: string | null = null;
                  if (ref.referenceType === "session") {
                    href = `/sessions/${ref.referenceId}`;
                  } else if (ref.referenceType === "clinical_document") {
                    href = `/clients/${clientId}/documents/${ref.referenceId}`;
                  }

                  const content = (
                    <div className="flex items-center gap-2 text-sm">
                      <ReferenceIcon type={ref.referenceType} />
                      <span>
                        {label} &mdash; {date}
                      </span>
                    </div>
                  );

                  return href ? (
                    <Link
                      className="block rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                      href={href}
                      key={ref.id}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="rounded-md px-2 py-1.5" key={ref.id}>
                      {content}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Content Sections */}
        {typeConfig.sections.map((sectionDef) => {
          const value =
            editedContent[sectionDef.key] ??
            document.content[sectionDef.key] ??
            "";

          return (
            <div className="space-y-2" key={sectionDef.key}>
              <div className="flex items-center gap-1.5">
                <Label className="text-sm font-semibold uppercase tracking-wide">
                  {sectionDef.label}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">{sectionDef.description}</p>
                  </TooltipContent>
                </Tooltip>
                {!isEditable && (
                  <Lock className="size-3.5 text-muted-foreground ml-auto" />
                )}
              </div>
              <AutoResizeTextarea
                disabled={!isEditable}
                onChange={(v) => updateField(sectionDef.key, v)}
                value={value}
              />
            </div>
          );
        })}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {isEditable && (
            <>
              <Button
                className="min-h-11"
                disabled={saving || !isDirty}
                onClick={handleSave}
                size="lg"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Save Changes
              </Button>

              {document.status === "draft" && (
                <Button
                  className="min-h-11"
                  disabled={saving}
                  onClick={() => handleStatusUpdate("reviewed")}
                  size="lg"
                  variant="outline"
                >
                  Mark as Reviewed
                </Button>
              )}

              {document.status === "reviewed" && (
                <Button
                  className="min-h-11"
                  disabled={saving}
                  onClick={() => setConfirmFinalise(true)}
                  size="lg"
                  variant="outline"
                >
                  Finalise
                </Button>
              )}

              {document.status === "draft" && (
                <Button
                  className="min-h-11"
                  disabled={saving}
                  onClick={() => setConfirmRegenerate(true)}
                  size="lg"
                  variant="ghost"
                >
                  <RefreshCw className="size-4" />
                  Regenerate
                </Button>
              )}
            </>
          )}

          {document.status === "finalised" && (
            <Button
              className="min-h-11"
              onClick={() =>
                router.push(
                  `/clients/${clientId}/documents/generate?type=${document.documentType}&supersedesId=${document.id}`
                )
              }
              size="lg"
              variant="outline"
            >
              Create New Version
            </Button>
          )}

          <Button
            className="min-h-11 ml-auto"
            disabled={saving || deleting}
            onClick={() => setConfirmDelete(true)}
            size="lg"
            variant="ghost"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Finalise Confirmation Dialog */}
      <Dialog onOpenChange={setConfirmFinalise} open={confirmFinalise}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalise Document</DialogTitle>
            <DialogDescription>
              Finalising this document will lock it for editing. You can create
              a new version if changes are needed later. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmFinalise(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() => handleStatusUpdate("finalised")}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Finalise Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation Dialog */}
      <Dialog onOpenChange={setConfirmRegenerate} open={confirmRegenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Document</DialogTitle>
            <DialogDescription>
              This will discard the current draft and regenerate the document
              from scratch. Any edits you have made will be lost. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmRegenerate(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmRegenerate(false);
                router.push(
                  `/clients/${clientId}/documents/generate?type=${document.documentType}&regenerateId=${document.id}`
                );
              }}
              variant="destructive"
            >
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmDelete(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={handleDelete}
              variant="destructive"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
