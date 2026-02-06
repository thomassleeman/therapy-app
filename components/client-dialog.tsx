"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClients } from "@/hooks/use-clients";
import type { Client } from "@/lib/db/types";

interface ClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onSuccess?: (client: Client) => void;
}

export function ClientDialog({
  open,
  onOpenChange,
  client,
  onSuccess,
}: ClientDialogProps) {
  const [name, setName] = useState(client?.name ?? "");
  const [background, setBackground] = useState(client?.background ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { refresh } = useClients();

  const isEditing = Boolean(client);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Client name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const url = isEditing ? `/api/clients/${client?.id}` : "/api/clients";
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          background: background.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save client");
      }

      const savedClient = await response.json();

      toast.success(isEditing ? "Client updated" : "Client created");
      refresh();
      onOpenChange(false);
      onSuccess?.(savedClient);

      // Reset form
      if (!isEditing) {
        setName("");
        setBackground("");
      }
    } catch (_error) {
      toast.error(
        isEditing ? "Failed to update client" : "Failed to create client"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      setName(client?.name ?? "");
      setBackground(client?.background ?? "");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Client" : "Create Client"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the client's details."
                : "Add a new client to organize your chats."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                autoFocus
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter client name"
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="background">Background (optional)</Label>
              <Textarea
                id="background"
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Notes about this client..."
                rows={3}
                value={background}
              />
              <p className="text-muted-foreground text-xs">
                Private notes for your reference only.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Create Client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
