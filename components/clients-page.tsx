"use client";

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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useClients } from "@/hooks/use-clients";
import type { Chat, Client, ClientStatus } from "@/lib/db/types";
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES } from "@/lib/db/types";
import { fetcher, formatDate } from "@/lib/utils";
import { ClientDialog } from "./client-dialog";
import { FabNewChat } from "./fab-new-chat";
import {
  ChevronDownIcon,
  MessageIcon,
  PencilEditIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "./icons";

type ChatCounts = { clientId: string | null; count: number }[];

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  discharged: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  waitlisted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {CLIENT_STATUS_LABELS[status]}
    </span>
  );
}

function ClientCard({
  client,
  chatCount,
  onEdit,
  onDelete,
  onNewChat,
}: {
  client: Client;
  chatCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onNewChat: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: chatsData } = useSWR<{ chats: Chat[] }>(
    isOpen ? `/api/clients/chats?clientId=${client.id}` : null,
    fetcher
  );

  const modalities = client.therapeuticModalities ?? [];
  const tags = client.tags ?? [];
  const showOverflow = modalities.length > 3;
  const displayModalities = showOverflow ? modalities.slice(0, 3) : modalities;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              className="font-medium hover:underline"
              href={`/clients/${client.id}`}
            >
              {client.name}
            </Link>
            <StatusBadge status={client.status} />
          </div>
          {modalities.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {displayModalities.map((m) => (
                <Badge
                  className="px-1.5 py-0 text-[10px]"
                  key={m}
                  variant="outline"
                >
                  {m}
                </Badge>
              ))}
              {showOverflow && (
                <span className="text-[10px] text-muted-foreground">
                  +{modalities.length - 3} more
                </span>
              )}
            </div>
          )}
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((t) => (
                <Badge
                  className="px-1.5 py-0 text-[10px]"
                  key={t}
                  variant="secondary"
                >
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {client.background && (
            <div className="mt-1 truncate text-sm text-muted-foreground">
              {client.background}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-sm text-muted-foreground">
            {chatCount} {chatCount === 1 ? "chat" : "chats"}
          </span>
          <Button onClick={onNewChat} size="icon" variant="ghost">
            <PlusIcon />
          </Button>
          <Button onClick={onEdit} size="icon" variant="ghost">
            <PencilEditIcon />
          </Button>
          <Button
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            size="icon"
            variant="ghost"
          >
            <TrashIcon />
          </Button>
        </div>
      </div>

      {chatCount > 0 && (
        <Collapsible onOpenChange={setIsOpen} open={isOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 border-t px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDownIcon />
            <span>{isOpen ? "Hide chats" : "Show chats"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t">
              {chatsData?.chats?.map((chat) => (
                <Link
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent transition-colors"
                  href={`/chat/${chat.id}`}
                  key={chat.id}
                >
                  <MessageIcon size={14} />
                  <span className="truncate flex-1">{chat.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(chat.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function GeneralSection({ chatCount }: { chatCount: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: chatsData } = useSWR<{ chats: Chat[] }>(
    isOpen ? "/api/clients/chats?clientId=general" : null,
    fetcher
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <MessageIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">General</div>
          <div className="text-sm text-muted-foreground">
            Chats without a specific client
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-sm text-muted-foreground">
            {chatCount} {chatCount === 1 ? "chat" : "chats"}
          </span>
          <Link href="/chat/new?clientId=general">
            <Button size="icon" variant="ghost">
              <PlusIcon />
            </Button>
          </Link>
        </div>
      </div>

      {chatCount > 0 && (
        <Collapsible onOpenChange={setIsOpen} open={isOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 border-t px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDownIcon />
            <span>{isOpen ? "Hide chats" : "Show chats"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t">
              {chatsData?.chats?.map((chat) => (
                <Link
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent transition-colors"
                  href={`/chat/${chat.id}`}
                  key={chat.id}
                >
                  <MessageIcon size={14} />
                  <span className="truncate flex-1">{chat.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(chat.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function ClientsPage() {
  const router = useRouter();
  const { clients, isLoading: isLoadingClients, refresh } = useClients();
  const { data: countsData, mutate: mutateCounts } = useSWR<{
    counts: ChatCounts;
  }>("/api/clients/chats", fetcher);

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

  const showGeneralSection =
    statusFilter === "all" &&
    (!searchQuery.trim() ||
      "general".includes(searchQuery.trim().toLowerCase()));

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
    <div className="flex flex-1 flex-col bg-background overflow-y-auto">
      <header className="flex items-center gap-2 bg-background px-4 py-1.5">
        <h1 className="text-lg font-semibold">
          Clients{!isLoadingClients && ` (${filteredClients.length})`}
        </h1>
        <div className="ml-auto">
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
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="pt-4 space-y-3">
          {!isLoadingClients && clients.length > 0 && (
            <>
              <Input
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients by name, background, issues, or modalities..."
                type="search"
                value={searchQuery}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setStatusFilter("all")}
                  size="sm"
                  variant={statusFilter === "all" ? "default" : "outline"}
                >
                  All
                </Button>
                {CLIENT_STATUSES.map((status) => (
                  <Button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    size="sm"
                    variant={statusFilter === status ? "default" : "outline"}
                  >
                    {CLIENT_STATUS_LABELS[status]}
                  </Button>
                ))}
              </div>
            </>
          )}

          {isLoadingClients ? (
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div className="rounded-lg border p-4" key={i}>
                  <div className="flex items-center gap-3">
                    <div className="size-10 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {clients.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <UserIcon />
                  <h3 className="mt-2 font-medium">No clients yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add your first client to start organizing your reflections.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => {
                      setEditingClient(null);
                      setShowClientDialog(true);
                    }}
                    variant="outline"
                  >
                    <PlusIcon />
                    <span>Add Client</span>
                  </Button>
                </div>
              )}

              {clients.length > 0 &&
                filteredClients.length === 0 &&
                hasActiveFilters && (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <h3 className="font-medium">
                      No clients match your search
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try adjusting your search term or status filter.
                    </p>
                  </div>
                )}

              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredClients.map((client) => (
                  <ClientCard
                    chatCount={getCountForClient(client.id)}
                    client={client}
                    key={client.id}
                    onDelete={() => setDeleteClient(client)}
                    onEdit={() => {
                      setEditingClient(client);
                      setShowClientDialog(true);
                    }}
                    onNewChat={() =>
                      router.push(`/chat/new?clientId=${client.id}`)
                    }
                  />
                ))}

                {showGeneralSection && (
                  <GeneralSection chatCount={getCountForClient(null)} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}
