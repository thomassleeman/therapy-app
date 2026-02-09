"use client";

import { useState } from "react";
import { ClientDialog } from "@/components/client-dialog";
import { Button } from "@/components/ui/button";
import { useClients } from "@/hooks/use-clients";
import type { Client, ClientStatus } from "@/lib/db/types";
import { CLIENT_STATUS_LABELS } from "@/lib/db/types";
import { MessageIcon, PlusIcon, UserIcon } from "./icons";

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  discharged: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  waitlisted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

function PickerStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[status]}`}
    >
      {CLIENT_STATUS_LABELS[status]}
    </span>
  );
}

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
      <div className="w-full max-w-5xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Who is this session for?
          </h1>
          <p className="text-sm text-muted-foreground">
            Select a client to begin a reflection, or choose General for
            non-client-specific work.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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

          {isLoading
            ? [1, 2, 3].map((i) => (
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
              ))
            : clients.map((client) => (
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
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {client.name}
                      </span>
                      <PickerStatusBadge status={client.status} />
                    </div>
                    {client.therapeuticModalities.length > 0 && (
                      <div className="truncate text-xs text-muted-foreground">
                        {client.therapeuticModalities.join(", ")}
                      </div>
                    )}
                  </div>
                </button>
              ))}
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
