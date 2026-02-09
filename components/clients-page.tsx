"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useClients } from "@/hooks/use-clients";
import type { Chat, Client } from "@/lib/db/types";
import { fetcher } from "@/lib/utils";
import { ClientDialog } from "./client-dialog";
import {
  ChevronDownIcon,
  MessageIcon,
  PencilEditIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "./icons";
import { SidebarToggle } from "./sidebar-toggle";

type ChatCounts = { clientId: string | null; count: number }[];

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

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{client.name}</div>
          {client.background && (
            <div className="truncate text-sm text-muted-foreground">
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
                    {new Date(chat.createdAt).toLocaleDateString()}
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
          <Link href="/?clientId=general">
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
                    {new Date(chat.createdAt).toLocaleDateString()}
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
    <div className="flex h-dvh flex-col bg-background">
      <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
        <SidebarToggle />
        <h1 className="text-lg font-semibold">Clients</h1>
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
        <div className="mx-auto max-w-2xl space-y-3 pt-4">
          {isLoadingClients ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
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

              {clients.map((client) => (
                <ClientCard
                  chatCount={getCountForClient(client.id)}
                  client={client}
                  key={client.id}
                  onDelete={() => setDeleteClient(client)}
                  onEdit={() => {
                    setEditingClient(client);
                    setShowClientDialog(true);
                  }}
                  onNewChat={() => router.push(`/?clientId=${client.id}`)}
                />
              ))}

              <GeneralSection chatCount={getCountForClient(null)} />
            </>
          )}
        </div>
      </div>

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
          if (!open) setDeleteClient(null);
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
