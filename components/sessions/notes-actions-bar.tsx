"use client";

import { Check, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NoteStatus } from "@/lib/db/types";

interface NotesActionsBarProps {
  noteStatus: NoteStatus;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isRegenerating?: boolean;
  isDeleting?: boolean;
  onSave: () => void;
  onStatusChange: (status: NoteStatus) => void;
  onRegenerate: () => void;
  onDelete: () => void;
}

export function NotesActionsBar({
  noteStatus,
  hasUnsavedChanges,
  isSaving,
  isRegenerating,
  isDeleting,
  onSave,
  onStatusChange,
  onRegenerate,
  onDelete,
}: NotesActionsBarProps) {
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isFinalised = noteStatus === "finalised";

  if (isFinalised) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-t bg-background px-4 py-3">
        <Button
          className="min-h-11"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={onSave}
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Save Changes
        </Button>

        {noteStatus === "draft" && (
          <Button
            className="min-h-11"
            disabled={isSaving}
            onClick={() => onStatusChange("reviewed")}
            variant="outline"
          >
            Mark as Reviewed
          </Button>
        )}

        {noteStatus === "reviewed" && (
          <Button
            className="min-h-11"
            disabled={isSaving}
            onClick={() => setConfirmFinalise(true)}
            variant="outline"
          >
            Finalise
          </Button>
        )}

        <Button
          className="min-h-11"
          disabled={isRegenerating || isFinalised}
          onClick={onRegenerate}
          variant="ghost"
        >
          <RefreshCw className="size-4" />
          Regenerate
        </Button>

        <Button
          className="min-h-11 ml-auto"
          disabled={isDeleting}
          onClick={() => setConfirmDelete(true)}
          variant="ghost"
        >
          <Trash2 className="size-4 text-destructive" />
          <span className="text-destructive">Delete</span>
        </Button>
      </div>

      {/* Finalise Confirmation */}
      <AlertDialog onOpenChange={setConfirmFinalise} open={confirmFinalise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalise Notes</AlertDialogTitle>
            <AlertDialogDescription>
              Finalising will lock these notes for editing. You can regenerate
              if changes are needed later. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onStatusChange("finalised");
                setConfirmFinalise(false);
              }}
            >
              Finalise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Note Confirmation */}
      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              This will permanently delete this clinical note. You can
              regenerate notes afterwards if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmDelete(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={isDeleting}
              onClick={() => {
                onDelete();
              }}
              variant="destructive"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete Note"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
