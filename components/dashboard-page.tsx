"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Chat, Client, RecentSession } from "@/lib/db/types";
import { formatDate } from "@/lib/utils";
import { ClientDialog } from "./client-dialog";
import { FabNewChat } from "./fab-new-chat";
import { MessageIcon, PlusIcon, UserIcon } from "./icons";

type ChatCount = { clientId: string | null; count: number };

function TranscriptionBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
          Completed
        </Badge>
      );
    case "transcribing":
    case "labelling":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 animate-pulse">
          Transcribing
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100">
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          {status === "uploading" ? "Uploading" : "Pending"}
        </Badge>
      );
  }
}

function NotesBadge({ status }: { status: string }) {
  switch (status) {
    case "draft":
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100">
          Draft
        </Badge>
      );
    case "reviewed":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100">
          Reviewed
        </Badge>
      );
    case "finalised":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
          Finalised
        </Badge>
      );
    case "generating":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 animate-pulse">
          Generating
        </Badge>
      );
    default:
      return <Badge variant="secondary">None</Badge>;
  }
}

export function DashboardPage({
  recentChats,
  recentSessions,
  clients,
  chatCounts,
  sessionCounts,
}: {
  recentChats: Chat[];
  recentSessions: RecentSession[];
  clients: Client[];
  chatCounts: ChatCount[];
  sessionCounts: Record<string, number>;
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
                View clients &rarr;
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

          {/* Recent Sessions */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Recent Sessions</h2>
              <Link
                className="text-sm text-muted-foreground hover:text-foreground"
                href="/sessions"
              >
                View all &rarr;
              </Link>
            </div>
            {recentSessions.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sessions yet. Record or upload a session to get started.
              </div>
            ) : (
              <div className="mt-3 divide-y rounded-lg border">
                {recentSessions.map((session) => (
                  <Link
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                    href={`/sessions/${session.id}`}
                    key={session.id}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {session.clientName ? (
                          <span>{session.clientName}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            No client
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(session.sessionDate)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <TranscriptionBadge
                        status={session.transcriptionStatus}
                      />
                      <NotesBadge status={session.notesStatus} />
                    </div>
                  </Link>
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
              {clients.map((client) => {
                const chatCount = getCountForClient(client.id);
                const sessionCount = sessionCounts[client.id] ?? 0;
                return (
                  <div
                    className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
                    key={client.id}
                  >
                    <Link
                      className="flex min-w-0 flex-1 items-center gap-3"
                      href={`/clients/${client.id}`}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <UserIcon />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {client.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {sessionCount}{" "}
                          {sessionCount === 1 ? "session" : "sessions"}
                          {" · "}
                          {chatCount} {chatCount === 1 ? "chat" : "chats"}
                        </div>
                      </div>
                    </Link>
                    <Link
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      href={`/chat/new?clientId=${client.id}`}
                      title="Start chat"
                    >
                      <MessageIcon size={16} />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ClientDialog
        onOpenChange={setShowClientDialog}
        open={showClientDialog}
      />

      <FabNewChat />
    </div>
  );
}
