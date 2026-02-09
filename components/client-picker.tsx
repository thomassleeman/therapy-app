"use client";

import { useState } from "react";
import { ClientDialog } from "@/components/client-dialog";
import { Button } from "@/components/ui/button";
import { useClients } from "@/hooks/use-clients";
import type { Client } from "@/lib/db/types";
import { MessageIcon, PlusIcon, UserIcon } from "./icons";

export function ClientPicker({
  onSelect,
}: {
  onSelect: (clientId: string | null) => void;
}) {
  const { clients, isLoading } = useClients();
  const [showClientDialog, setShowClientDialog] = useState(false);

  const handleClientCreated = (client: Client) => {
    onSelect(client.id);
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Who is this session for?
          </h1>
          <p className="text-sm text-muted-foreground">
            Select a client to begin a reflection, or choose General for
            non-client-specific work.
          </p>
        </div>

        <div className="space-y-2">
          <button
            className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
            onClick={() => onSelect(null)}
            type="button"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <MessageIcon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">General</div>
              <div className="text-sm text-muted-foreground">
                General reflection (no specific client)
              </div>
            </div>
          </button>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  className="flex items-center gap-3 rounded-lg border p-4"
                  key={i}
                >
                  <div className="size-10 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            clients.map((client) => (
              <button
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
                key={client.id}
                onClick={() => onSelect(client.id)}
                type="button"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{client.name}</div>
                  {client.background && (
                    <div className="truncate text-sm text-muted-foreground">
                      {client.background}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <Button
          className="w-full"
          onClick={() => setShowClientDialog(true)}
          variant="outline"
        >
          <PlusIcon />
          <span>Create New Client</span>
        </Button>
      </div>

      <ClientDialog
        onOpenChange={setShowClientDialog}
        onSuccess={handleClientCreated}
        open={showClientDialog}
      />
    </div>
  );
}
