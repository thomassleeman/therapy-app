"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionConsent, TherapySession } from "@/lib/db/types";
import {
  extractErrorMessage,
  showErrorToast,
} from "@/lib/errors/client-error-handler";

interface SessionDetailsTabProps {
  session: TherapySession;
  consents: SessionConsent[];
  onSessionDeleted: () => void;
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

export function SessionDetailsTab({
  session,
  consents,
  onSessionDeleted,
}: SessionDetailsTabProps) {
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteSession = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast({ type: "success", description: "Session deleted." });
        onSessionDeleted();
      } else {
        const message = await extractErrorMessage(
          res,
          "Failed to delete session. Please try again."
        );
        toast({ type: "error", description: message });
      }
    } catch (err) {
      showErrorToast(err, "Failed to delete session. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDeleteSession(false);
    }
  }, [session.id, onSessionDeleted]);

  return (
    <div className="space-y-8">
      {/* Session metadata */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Session Information
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="text-sm font-medium">
              {formatDate(session.sessionDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-sm font-medium">
              {session.durationMinutes
                ? `${session.durationMinutes} minutes`
                : "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Delivery Method</p>
            <p className="text-sm font-medium capitalize">
              {session.deliveryMethod ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm font-medium">
              {formatDateTime(session.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Consent records */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Consent Records
        </h3>
        {consents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No consent records found.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Consented</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consents.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm capitalize">
                      {c.consentType.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {c.consentingParty}
                    </TableCell>
                    <TableCell>
                      {c.consented ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="destructive">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(c.consentedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      {/* Danger zone */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-destructive">
          Danger Zone
        </h3>
        <div className="rounded-lg border border-destructive/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Session</p>
              <p className="text-xs text-muted-foreground mt-1">
                Permanently remove this session and all associated data.
              </p>
            </div>
            <Button
              className="min-h-11"
              onClick={() => setConfirmDeleteSession(true)}
              size="lg"
              variant="destructive"
            >
              <Trash2 className="size-4" />
              Delete Session
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Session Dialog */}
      <Dialog
        onOpenChange={setConfirmDeleteSession}
        open={confirmDeleteSession}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              This will permanently delete the session record, transcript, and
              notes. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmDeleteSession(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={handleDeleteSession}
              variant="destructive"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete Session"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
