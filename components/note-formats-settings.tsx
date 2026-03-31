"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { toast } from "@/components/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  extractErrorMessage,
  showErrorToast,
} from "@/lib/errors/client-error-handler";
import type {
  CustomNoteFormat,
  CustomNoteFormatSection,
} from "@/lib/db/types";

const MAX_FORMATS = 10;
const MAX_SECTIONS = 20;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_GENERAL_RULES_LENGTH = 1000;

function generateKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/_{2,}/g, "_");
}

interface SectionFormData {
  label: string;
  key: string;
  description: string;
  required: boolean;
}

function createEmptySection(): SectionFormData {
  return { label: "", key: "", description: "", required: true };
}

export function NoteFormatsSettings() {
  const [formats, setFormats] = useState<CustomNoteFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFormat, setEditingFormat] = useState<CustomNoteFormat | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<CustomNoteFormat | null>(
    null
  );

  const fetchFormats = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/note-formats");
      if (!res.ok) {
        const message = await extractErrorMessage(
          res,
          "Failed to load custom formats."
        );
        toast({ type: "error", description: message });
        return;
      }
      const data: CustomNoteFormat[] = await res.json();
      setFormats(data);
    } catch (err) {
      showErrorToast(err, "Failed to load custom formats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFormats();
  }, [fetchFormats]);

  function handleNew() {
    setEditingFormat(null);
    setEditorOpen(true);
  }

  function handleEdit(format: CustomNoteFormat) {
    setEditingFormat(format);
    setEditorOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(
        `/api/settings/note-formats/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const message = await extractErrorMessage(
          res,
          "Failed to delete format."
        );
        toast({ type: "error", description: message });
        return;
      }
      toast({ type: "success", description: "Format deleted." });
      setDeleteTarget(null);
      fetchFormats();
    } catch (err) {
      showErrorToast(err, "Failed to delete format.");
    }
  }

  function handleEditorClose() {
    setEditorOpen(false);
    setEditingFormat(null);
  }

  function handleSaved() {
    handleEditorClose();
    fetchFormats();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {formats.length} of {MAX_FORMATS} formats used
        </p>
        <Button
          disabled={formats.length >= MAX_FORMATS}
          onClick={handleNew}
          size="sm"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Format
        </Button>
      </div>

      {formats.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You haven&apos;t created any custom formats yet. Standard formats
            (SOAP, DAP, BIRP, GIRP, Narrative) are always available.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {formats.map((format) => (
            <FormatCard
              format={format}
              key={format.id}
              onDelete={() => setDeleteTarget(format)}
              onEdit={() => handleEdit(format)}
            />
          ))}
        </div>
      )}

      <Dialog onOpenChange={(open) => !open && handleEditorClose()} open={editorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingFormat ? "Edit Format" : "New Format"}
            </DialogTitle>
          </DialogHeader>
          <FormatEditor
            existing={editingFormat}
            onCancel={handleEditorClose}
            onSaved={handleSaved}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete format</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}
              &rdquo;? Existing notes that used this format will not be affected
              — they&apos;ll continue to display their content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormatCard({
  format,
  onEdit,
  onDelete,
}: {
  format: CustomNoteFormat;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sectionLabels = format.sections.map((s) => s.label).join(", ");
  const createdDate = new Date(format.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{format.name}</h3>
            <Badge className="shrink-0" variant="secondary">
              {format.sections.length}{" "}
              {format.sections.length === 1 ? "section" : "sections"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {sectionLabels}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Created {createdDate}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button onClick={onEdit} size="icon" variant="ghost">
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button onClick={onDelete} size="icon" variant="ghost">
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormatEditor({
  existing,
  onCancel,
  onSaved,
}: {
  existing: CustomNoteFormat | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [sections, setSections] = useState<SectionFormData[]>(() => {
    if (existing) {
      return existing.sections.map((s) => ({
        label: s.label,
        key: s.key,
        description: s.description,
        required: s.required,
      }));
    }
    return [createEmptySection()];
  });
  const [generalRules, setGeneralRules] = useState(
    existing?.generalRules ?? ""
  );

  function updateSection(index: number, updates: Partial<SectionFormData>) {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, ...updates };
        if ("label" in updates) {
          updated.key = generateKey(updated.label);
        }
        return updated;
      })
    );
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function addSection() {
    setSections((prev) => [...prev, createEmptySection()]);
  }

  function moveSection(index: number, direction: "up" | "down") {
    setSections((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function validate(): string | null {
    if (name.trim().length === 0) return "Format name is required.";
    if (name.trim().length > MAX_NAME_LENGTH)
      return `Format name must be ${MAX_NAME_LENGTH} characters or fewer.`;
    if (sections.length === 0) return "At least one section is required.";

    const seenKeys = new Set<string>();
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.label.trim().length === 0)
        return `Section ${i + 1}: label is required.`;
      if (s.key.length === 0)
        return `Section ${i + 1}: label must contain at least one letter or number.`;
      if (seenKeys.has(s.key))
        return `Duplicate section key "${s.key}". Change one of the labels.`;
      seenKeys.add(s.key);
      if (s.description.trim().length === 0)
        return `Section ${i + 1}: description is required.`;
      if (s.description.length > MAX_DESCRIPTION_LENGTH)
        return `Section ${i + 1}: description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
    }

    if (generalRules.length > MAX_GENERAL_RULES_LENGTH)
      return `General rules must be ${MAX_GENERAL_RULES_LENGTH} characters or fewer.`;

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const error = validate();
    if (error) {
      toast({ type: "error", description: error });
      return;
    }

    const payload = {
      name: name.trim(),
      sections: sections.map((s) => ({
        key: s.key,
        label: s.label.trim(),
        description: s.description.trim(),
        required: s.required,
      })),
      generalRules: generalRules.trim() || null,
    };

    setSaving(true);
    try {
      const url = existing
        ? `/api/settings/note-formats/${existing.id}`
        : "/api/settings/note-formats";
      const method = existing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await extractErrorMessage(
          res,
          `Failed to ${existing ? "update" : "create"} format.`
        );
        toast({ type: "error", description: message });
        return;
      }

      toast({
        type: "success",
        description: `Format ${existing ? "updated" : "created"}.`,
      });
      onSaved();
    } catch (err) {
      showErrorToast(
        err,
        `Failed to ${existing ? "update" : "create"} format.`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="format-name">
          Format name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="format-name"
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Integrative Session Note"
          value={name}
        />
        <p className="text-xs text-muted-foreground text-right">
          {name.length}/{MAX_NAME_LENGTH}
        </p>
      </div>

      <div className="space-y-3">
        <Label>
          Sections <span className="text-destructive">*</span>
        </Label>
        <div className="space-y-4">
          {sections.map((section, index) => (
            <SectionEditor
              canMoveDown={index < sections.length - 1}
              canMoveUp={index > 0}
              canRemove={sections.length > 1}
              index={index}
              key={`section-${index}`}
              onMove={(dir) => moveSection(index, dir)}
              onRemove={() => removeSection(index)}
              onUpdate={(updates) => updateSection(index, updates)}
              section={section}
            />
          ))}
        </div>
        <Button
          className="w-full"
          disabled={sections.length >= MAX_SECTIONS}
          onClick={addSection}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Section
          {sections.length >= MAX_SECTIONS && " (limit reached)"}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="general-rules">General rules (optional)</Label>
        <Textarea
          id="general-rules"
          maxLength={MAX_GENERAL_RULES_LENGTH}
          onChange={(e) => setGeneralRules(e.target.value)}
          placeholder="Standing instructions for every note in this format. e.g. 'Always include a risk assessment statement' or 'Note whether between-session homework was reviewed'."
          rows={3}
          value={generalRules}
        />
        <p className="text-xs text-muted-foreground text-right">
          {generalRules.length}/{MAX_GENERAL_RULES_LENGTH}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={saving} type="submit">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {existing ? "Save Changes" : "Create Format"}
        </Button>
      </div>
    </form>
  );
}

function SectionEditor({
  section,
  index,
  canRemove,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onRemove,
  onMove,
}: {
  section: SectionFormData;
  index: number;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (updates: Partial<SectionFormData>) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Section {index + 1}
          </p>
          <div className="flex items-center gap-0.5">
            <Button
              disabled={!canMoveUp}
              onClick={() => onMove("up")}
              size="icon"
              title="Move up"
              type="button"
              variant="ghost"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              disabled={!canMoveDown}
              onClick={() => onMove("down")}
              size="icon"
              title="Move down"
              type="button"
              variant="ghost"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              disabled={!canRemove}
              onClick={onRemove}
              size="icon"
              title="Remove section"
              type="button"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`section-label-${index}`}>Label</Label>
          <Input
            id={`section-label-${index}`}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="e.g. Presenting Concerns"
            value={section.label}
          />
          {section.key && (
            <p className="text-xs text-muted-foreground">
              <ChevronRight className="inline h-3 w-3" /> Key:{" "}
              <code className="bg-muted px-1 rounded">{section.key}</code>
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`section-desc-${index}`}>Description</Label>
          <Textarea
            id={`section-desc-${index}`}
            maxLength={MAX_DESCRIPTION_LENGTH}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Describe what content should go in this section. This is given to the AI when generating notes, so be specific."
            rows={3}
            value={section.description}
          />
          <p className="text-xs text-muted-foreground text-right">
            {section.description.length}/{MAX_DESCRIPTION_LENGTH}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={section.required}
            id={`section-required-${index}`}
            onCheckedChange={(checked) =>
              onUpdate({ required: checked === true })
            }
          />
          <Label
            className="font-normal text-sm"
            htmlFor={`section-required-${index}`}
          >
            Required section
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
