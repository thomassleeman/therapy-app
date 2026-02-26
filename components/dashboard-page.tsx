"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Chat, Client, Document } from "@/lib/db/types";
import { formatDate } from "@/lib/utils";
import { ClientDialog } from "./client-dialog";
import { FileIcon, MessageIcon, PlusIcon, UserIcon } from "./icons";

type ChatCount = { clientId: string | null; count: number };

export function DashboardPage({
  recentChats,
  documents,
  clients,
  chatCounts,
}: {
  recentChats: Chat[];
  documents: Document[];
  clients: Client[];
  chatCounts: ChatCount[];
}) {
  const [showClientDialog, setShowClientDialog] = useState(false);

  const getClientName = (clientId: string | null) => {
    if (!clientId) {
      return "General";
    }
    return clients.find((c) => c.id === clientId)?.name ?? "Unknown";
  };

  const getCountForClient = (clientId: string | null) => {
    return chatCounts.find((c) => c.clientId === clientId)?.count ?? 0;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back. Here&apos;s an overview of your recent activity.
        </p>

        {/* Quick actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/chat/new?clientId=general">
            <Button>
              <MessageIcon size={16} />
              <span>Start General Chat</span>
            </Button>
          </Link>
          <Button onClick={() => setShowClientDialog(true)} variant="outline">
            <PlusIcon size={16} />
            <span>Add Client</span>
          </Button>
          <Link href="/clients">
            <Button variant="outline">
              <UserIcon />
              <span>View All Clients</span>
            </Button>
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Recent Chats */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Recent Chats</h2>
              <Link
                className="text-sm text-muted-foreground hover:text-foreground"
                href="/clients"
              >
                View all
              </Link>
            </div>
            {recentChats.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No chats yet. Start a conversation to get going.
              </div>
            ) : (
              <div className="mt-3 divide-y rounded-lg border">
                {recentChats.map((chat) => (
                  <Link
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                    href={`/chat/${chat.id}`}
                    key={chat.id}
                  >
                    <MessageIcon size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {chat.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getClientName(chat.clientId)} &middot;{" "}
                        {formatDate(chat.createdAt)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent Documents */}
          <section>
            <h2 className="font-medium">Recent Documents</h2>
            {documents.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No documents yet. Documents created during chats will appear
                here.
              </div>
            ) : (
              <div className="mt-3 divide-y rounded-lg border">
                {documents.map((doc) => (
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    key={`${doc.id}-${doc.createdAt}`}
                  >
                    <FileIcon size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {doc.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {doc.kind} &middot; {formatDate(doc.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Clients overview */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Clients</h2>
            <Link
              className="text-sm text-muted-foreground hover:text-foreground"
              href="/clients"
            >
              Manage clients
            </Link>
          </div>
          {clients.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No clients yet. Add a client to start organizing your reflections.
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {clients.map((client) => (
                <Link
                  className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
                  href={`/chat/new?clientId=${client.id}`}
                  key={client.id}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {client.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getCountForClient(client.id)}{" "}
                      {getCountForClient(client.id) === 1 ? "chat" : "chats"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <ClientDialog
        onOpenChange={setShowClientDialog}
        open={showClientDialog}
      />
    </div>
  );
}
