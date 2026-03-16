"use client";

import { useMemo, useState } from "react";
import { ClientDialog } from "@/components/client-dialog";
import { Button } from "@/components/ui/button";
import { useClients } from "@/hooks/use-clients";
import type { Client, ClientStatus } from "@/lib/db/types";
import { CLIENT_STATUS_LABELS } from "@/lib/db/types";
import { ChevronDownIcon, MessageIcon, PlusIcon, UserIcon } from "./icons";

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: "bg-green-600 text-white dark:bg-green-900 dark:text-green-200",
  paused: "bg-amber-600 text-white dark:bg-amber-900 dark:text-amber-200",
  discharged: "bg-gray-600 text-white dark:bg-gray-600 dark:text-gray-200",
  waitlisted: "bg-blue-600 text-white dark:bg-blue-900 dark:text-blue-200",
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

function ClientCard({
  client,
  onSelect,
}: {
  client: Client;
  onSelect: (clientId: string) => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
      onClick={() => onSelect(client.id)}
      type="button"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <UserIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{client.name}</span>
          <PickerStatusBadge status={client.status} />
        </div>
        {client.therapeuticModalities.length > 0 && (
          <div className="truncate text-xs text-muted-foreground">
            {client.therapeuticModalities.join(", ")}
          </div>
        )}
      </div>
    </button>
  );
}

export function ClientPicker({
  onSelect,
}: {
  onSelect: (clientId: string | null) => void;
}) {
  const { clients, isLoading } = useClients();
  const [showClientDialog, setShowClientDialog] = useState(false);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const { activeClients, inactiveClients } = useMemo(() => {
    const active: Client[] = [];
    const inactive: Client[] = [];
    for (const client of clients) {
      if (client.status === "active") {
        active.push(client);
      } else {
        inactive.push(client);
      }
    }
    return { activeClients: active, inactiveClients: inactive };
  }, [clients]);

  const handleClientCreated = (client: Client) => {
    onSelect(client.id);
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-5xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Who is this reflection about?
          </h1>
          <p className="text-sm text-muted-foreground">
            Select a client to begin a reflection, or choose General for
            non-client-specific work.
          </p>
        </div>

        {/* General Reflection */}
        <button
          className="flex w-full items-center gap-3 rounded-lg border-2 border-primary/20 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
          onClick={() => onSelect(null)}
          type="button"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MessageIcon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">General Reflection</div>
            <div className="text-sm text-muted-foreground">
              Not about a specific client
            </div>
          </div>
        </button>

        {/* Active Clients */}
        {isLoading ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Active Clients
            </h2>
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
          </div>
        ) : (
          <>
            {activeClients.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Active Clients
                </h2>
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {activeClients.map((client) => (
                    <ClientCard
                      client={client}
                      key={client.id}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              </div>
            )}

            {inactiveClients.length > 0 && (
              <div className="space-y-3">
                <button
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setInactiveExpanded((prev) => !prev)}
                  type="button"
                >
                  <span
                    className={`inline-flex transition-transform ${inactiveExpanded ? "rotate-0" : "-rotate-90"}`}
                  >
                    <ChevronDownIcon size={14} />
                  </span>
                  Paused / Discharged / Waitlisted ({inactiveClients.length}{" "}
                  {inactiveClients.length === 1 ? "client" : "clients"})
                </button>
                {inactiveExpanded && (
                  <div className="grid grid-cols-1 items-start gap-3 opacity-75 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {inactiveClients.map((client) => (
                      <ClientCard
                        client={client}
                        key={client.id}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

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
