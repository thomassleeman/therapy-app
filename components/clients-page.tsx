"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
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
import { useClients } from "@/hooks/use-clients";
import type { Client, ClientStatus } from "@/lib/db/types";
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES } from "@/lib/db/types";
import { fetcher } from "@/lib/utils";
import { ClientDialog } from "./client-dialog";
import { FabNewChat } from "./fab-new-chat";
import { PencilEditIcon, PlusIcon, TrashIcon, UserIcon } from "./icons";
import {
  ListPageEmpty,
  ListPageFilters,
  ListPageSearch,
  ListPageShell,
  ListPageSkeleton,
} from "./list-page";

type ChatCounts = { clientId: string | null; count: number }[];

type ActivityData = {
  sessionCounts: Record<string, number>;
  lastActivity: Record<string, string>;
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  if (diffDays < 14) {
    return "1 week ago";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: "bg-green-600 text-white dark:bg-green-900/50 dark:text-green-300",
  paused: "bg-amber-600 text-white dark:bg-amber-900/50 dark:text-amber-300",
  discharged: "bg-gray-600 text-white dark:bg-gray-600 dark:text-gray-300",
  waitlisted: "bg-blue-600 text-white dark:bg-blue-900/50 dark:text-blue-300",
};

const CLIENT_FILTER_OPTIONS = CLIENT_STATUSES.map((status) => ({
  value: status,
  label: CLIENT_STATUS_LABELS[status],
}));

function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {CLIENT_STATUS_LABELS[status]}
    </span>
  );
}

export function ClientsPage() {
  const router = useRouter();
  const {
    clients,
    isLoading: isLoadingClients,
    error: clientsError,
    refresh,
  } = useClients();
  const { data: countsData, mutate: mutateCounts } = useSWR<{
    counts: ChatCounts;
  }>("/api/clients/chats", fetcher);
  const { data: activityData } = useSWR<ActivityData>(
    "/api/clients/activity",
    fetcher
  );

  const [showClientDialog, setShowClientDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      if (statusFilter !== "all" && client.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableFields = [
          client.name,
          client.background,
          client.presentingIssues,
          ...(client.therapeuticModalities ?? []),
        ];
        return searchableFields.some((field) =>
          field?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [clients, searchQuery, statusFilter]);

  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "all";

  const getCountForClient = (clientId: string | null) => {
    return countsData?.counts?.find((c) => c.clientId === clientId)?.count ?? 0;
  };

  const handleDelete = () => {
    if (!deleteClient) {
      return;
    }

    const deletePromise = fetch(`/api/clients/${deleteClient.id}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting client...",
      success: () => {
        refresh();
        mutateCounts();
        setDeleteClient(null);
        return "Client deleted. Their chats have been moved to General.";
      },
      error: "Failed to delete client",
    });
  };

  return (
    <ListPageShell
      count={filteredClients.length}
      headerAction={
        <Button
          onClick={() => {
            setEditingClient(null);
            setShowClientDialog(true);
          }}
          size="sm"
        >
          <PlusIcon />
          <span>Add Client</span>
        </Button>
      }
      isLoading={isLoadingClients}
      title="Clients"
    >
      {!isLoadingClients && clients.length > 0 && (
        <>
          <ListPageSearch
            onChange={setSearchQuery}
            placeholder="Search clients by name, background, issues, or modalities..."
            value={searchQuery}
          />
          <ListPageFilters
            onChange={setStatusFilter}
            options={CLIENT_FILTER_OPTIONS}
            value={statusFilter}
          />
        </>
      )}

      {isLoadingClients ? (
        <ListPageSkeleton />
      ) : clientsError && clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Failed to load clients. Please try refreshing the page.
          </p>
          <Button onClick={() => refresh()} size="sm" variant="outline">
            Try again
          </Button>
        </div>
      ) : (
        <>
          {clients.length === 0 && (
            <ListPageEmpty
              action={
                <Button
                  onClick={() => {
                    setEditingClient(null);
                    setShowClientDialog(true);
                  }}
                  variant="outline"
                >
                  <PlusIcon />
                  <span>Add Client</span>
                </Button>
              }
              description="Add your first client to start organising your reflections."
              icon={<UserIcon />}
              title="No clients yet"
            />
          )}

          {clients.length > 0 &&
            filteredClients.length === 0 &&
            hasActiveFilters && (
              <ListPageEmpty
                description="Try adjusting your search term or status filter."
                title="No clients match your search"
              />
            )}

          {filteredClients.length > 0 && (
            <div className="mt-4 flow-root">
              <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full divide-y divide-border">
                    <thead>
                      <tr>
                        <th
                          className="py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pl-0"
                          scope="col"
                        >
                          Client
                        </th>
                        <th
                          className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase md:table-cell"
                          scope="col"
                        >
                          Status
                        </th>
                        <th
                          className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase lg:table-cell"
                          scope="col"
                        >
                          Modalities
                        </th>
                        <th
                          className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:table-cell"
                          scope="col"
                        >
                          Activity
                        </th>
                        <th
                          className="hidden px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase xl:table-cell"
                          scope="col"
                        >
                          Last Active
                        </th>
                        <th className="py-3 pr-4 pl-3 sm:pr-0" scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredClients.map((client) => {
                        const modalities = client.therapeuticModalities ?? [];
                        const chatCount = getCountForClient(client.id);
                        const sessionCount =
                          activityData?.sessionCounts[client.id] ?? 0;
                        const lastActive =
                          activityData?.lastActivity[client.id];

                        return (
                          <tr
                            className="hover:bg-muted/50 transition-colors cursor-pointer"
                            key={client.id}
                            onClick={() => router.push(`/clients/${client.id}`)}
                          >
                            <td className="py-4 pr-3 pl-4 sm:pl-0">
                              <div className="flex items-center gap-3">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                  <UserIcon />
                                </div>
                                <div className="min-w-0">
                                  <Link
                                    className="text-sm font-medium hover:underline"
                                    href={`/clients/${client.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {client.name}
                                  </Link>
                                  <div className="mt-0.5 md:hidden">
                                    <StatusBadge status={client.status} />
                                  </div>
                                  {client.background && (
                                    <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                                      {client.background}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="hidden px-3 py-4 md:table-cell">
                              <StatusBadge status={client.status} />
                            </td>

                            <td className="hidden px-3 py-4 lg:table-cell">
                              {modalities.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {modalities.slice(0, 2).map((m) => (
                                    <Badge
                                      className="px-1.5 py-0 text-[10px]"
                                      key={m}
                                      variant="outline"
                                    >
                                      {m}
                                    </Badge>
                                  ))}
                                  {modalities.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      +{modalities.length - 2}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  —
                                </span>
                              )}
                            </td>

                            <td className="hidden px-3 py-4 sm:table-cell">
                              <span className="text-sm text-muted-foreground">
                                {sessionCount} session
                                {sessionCount === 1 ? "" : "s"} &middot;{" "}
                                {chatCount} chat{chatCount === 1 ? "" : "s"}
                              </span>
                            </td>

                            <td className="hidden px-3 py-4 xl:table-cell">
                              {lastActive ? (
                                <span className="text-sm text-muted-foreground">
                                  {formatRelativeDate(lastActive)}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  —
                                </span>
                              )}
                            </td>

                            <td className="py-4 pr-4 pl-3 text-right whitespace-nowrap sm:pr-0">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  className="size-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/chat/new?clientId=${client.id}`
                                    );
                                  }}
                                  size="icon"
                                  variant="ghost"
                                >
                                  <PlusIcon />
                                  <span className="sr-only">
                                    New chat for {client.name}
                                  </span>
                                </Button>
                                <Button
                                  className="size-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingClient(client);
                                    setShowClientDialog(true);
                                  }}
                                  size="icon"
                                  variant="ghost"
                                >
                                  <PencilEditIcon />
                                  <span className="sr-only">
                                    Edit {client.name}
                                  </span>
                                </Button>
                                <Button
                                  className="size-8 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteClient(client);
                                  }}
                                  size="icon"
                                  variant="ghost"
                                >
                                  <TrashIcon />
                                  <span className="sr-only">
                                    Delete {client.name}
                                  </span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <FabNewChat />

      <ClientDialog
        client={editingClient}
        onOpenChange={(open) => {
          setShowClientDialog(open);
          if (!open) {
            setEditingClient(null);
          }
        }}
        onSuccess={() => {
          mutateCounts();
        }}
        open={showClientDialog}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteClient(null);
          }
        }}
        open={deleteClient !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteClient?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the client. Their chats will be moved to the
              General category and will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete Client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListPageShell>
  );
}
