"use client";

import Link from "next/link";
import { useState } from "react";
import { ClientDialog } from "@/components/client-dialog";
import { FabNewChat } from "@/components/fab-new-chat";
import { PencilEditIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AgeBracket,
  Chat,
  Client,
  ClientStatus,
  DeliveryMethod,
  SessionFrequency,
  TherapySession,
} from "@/lib/db/types";
import {
  AGE_BRACKET_LABELS,
  CLIENT_STATUS_LABELS,
  DELIVERY_METHOD_LABELS,
  SESSION_FREQUENCY_LABELS,
} from "@/lib/db/types";
import { formatDate } from "@/lib/utils";

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  discharged: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  waitlisted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {CLIENT_STATUS_LABELS[status]}
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return (
    <div className="grid gap-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap">{String(value)}</dd>
    </div>
  );
}

const TRANSCRIPTION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  uploading: "Uploading",
  transcribing: "Transcribing",
  labelling: "Labelling",
  completed: "Completed",
  failed: "Failed",
};

interface ClientHubPageProps {
  client: Client;
  chats: Chat[];
  sessions: TherapySession[];
}

export function ClientHubPage({ client, chats, sessions }: ClientHubPageProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto">
      {/* Header */}
      <header className="bg-background border-b px-4 py-4 md:px-6">
        <div className="mb-3">
          <Link
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            href="/clients"
          >
            &larr; Clients
          </Link>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-semibold truncate">{client.name}</h1>
            <StatusBadge status={client.status} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setEditDialogOpen(true)}
              size="sm"
              variant="ghost"
            >
              <PencilEditIcon />
              <span>Edit</span>
            </Button>
            <Link href={`/chat/new?clientId=${client.id}`}>
              <Button size="sm">New Chat</Button>
            </Link>
            <Link href="/sessions/new">
              <Button size="sm" variant="outline">
                New Session
              </Button>
            </Link>
          </div>
        </div>
        {client.therapeuticModalities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {client.therapeuticModalities.map((m) => (
              <Badge key={m} variant="outline">
                {m}
              </Badge>
            ))}
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex-1 px-4 py-4 md:px-6">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="chats">
              Chats{chats.length > 0 && ` (${chats.length})`}
            </TabsTrigger>
            <TabsTrigger value="sessions">
              Sessions{sessions.length > 0 && ` (${sessions.length})`}
            </TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent className="mt-4" value="overview">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailsCard client={client} />
              <PracticeCard client={client} />
            </div>
          </TabsContent>

          {/* Chats Tab */}
          <TabsContent className="mt-4" value="chats">
            <ChatsTab chats={chats} clientId={client.id} />
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent className="mt-4" value="sessions">
            <SessionsTab sessions={sessions} />
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent className="mt-4" value="notes">
            <NotesTab client={client} />
          </TabsContent>
        </Tabs>
      </div>

      <FabNewChat clientId={client.id} />

      <ClientDialog
        client={client}
        onOpenChange={setEditDialogOpen}
        open={editDialogOpen}
      />
    </div>
  );
}

function DetailsCard({ client }: { client: Client }) {
  const hasContent =
    client.presentingIssues ||
    client.treatmentGoals ||
    client.riskConsiderations ||
    client.background;

  if (!hasContent) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DetailRow label="Presenting Issues" value={client.presentingIssues} />
        <DetailRow label="Treatment Goals" value={client.treatmentGoals} />
        <DetailRow
          label="Risk Considerations"
          value={client.riskConsiderations}
        />
        <DetailRow label="Background" value={client.background} />
      </CardContent>
    </Card>
  );
}

function PracticeCard({ client }: { client: Client }) {
  const hasContent =
    client.sessionFrequency ||
    client.deliveryMethod ||
    client.sessionDurationMinutes ||
    client.ageBracket ||
    client.therapyStartDate ||
    client.feePerSession;

  if (!hasContent) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DetailRow
          label="Session Frequency"
          value={
            client.sessionFrequency
              ? SESSION_FREQUENCY_LABELS[
                  client.sessionFrequency as SessionFrequency
                ]
              : null
          }
        />
        <DetailRow
          label="Delivery Method"
          value={
            client.deliveryMethod
              ? DELIVERY_METHOD_LABELS[client.deliveryMethod as DeliveryMethod]
              : null
          }
        />
        <DetailRow
          label="Duration"
          value={
            client.sessionDurationMinutes
              ? `${client.sessionDurationMinutes} minutes`
              : null
          }
        />
        <DetailRow
          label="Age Bracket"
          value={
            client.ageBracket
              ? AGE_BRACKET_LABELS[client.ageBracket as AgeBracket]
              : null
          }
        />
        <DetailRow
          label="Therapy Start Date"
          value={
            client.therapyStartDate ? formatDate(client.therapyStartDate) : null
          }
        />
        <DetailRow
          label="Fee per Session"
          value={
            client.feePerSession !== null
              ? `\u00A3${client.feePerSession}`
              : null
          }
        />
      </CardContent>
    </Card>
  );
}

function ChatsTab({ chats, clientId }: { chats: Chat[]; clientId: string }) {
  if (chats.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8">
          <CardDescription>No chats yet for this client.</CardDescription>
          <Link className="mt-4" href={`/chat/new?clientId=${clientId}`}>
            <Button size="sm">Start New Chat</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Link href={`/chat/new?clientId=${clientId}`}>
          <Button size="sm">Start New Chat</Button>
        </Link>
      </div>
      <Card>
        <CardContent className="p-0">
          {chats.map((chat, i) => (
            <div key={chat.id}>
              {i > 0 && <Separator />}
              <Link
                className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
                href={`/chat/${chat.id}`}
              >
                <span className="truncate text-sm font-medium">
                  {chat.title}
                </span>
                <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                  {formatDate(chat.createdAt)}
                </span>
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionsTab({ sessions }: { sessions: TherapySession[] }) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8">
          <CardDescription>No sessions recorded yet.</CardDescription>
          <Link className="mt-4" href="/sessions/new">
            <Button size="sm" variant="outline">
              New Session
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Link href="/sessions/new">
          <Button size="sm" variant="outline">
            New Session
          </Button>
        </Link>
      </div>
      <Card>
        <CardContent className="p-0">
          {sessions.map((session, i) => (
            <div key={session.id}>
              {i > 0 && <Separator />}
              <Link
                className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
                href={`/sessions/${session.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium">
                    {formatDate(session.sessionDate)}
                  </span>
                  {session.durationMinutes && (
                    <span className="text-xs text-muted-foreground">
                      {session.durationMinutes} min
                    </span>
                  )}
                </div>
                <Badge variant="secondary">
                  {TRANSCRIPTION_STATUS_LABELS[session.transcriptionStatus] ??
                    session.transcriptionStatus}
                </Badge>
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function NotesTab({ client }: { client: Client }) {
  const hasSupervisorNotes = Boolean(client.supervisorNotes);
  const hasTags = client.tags && client.tags.length > 0;

  if (!hasSupervisorNotes && !hasTags) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8">
          <CardDescription>No notes or tags for this client.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {hasSupervisorNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Supervisor Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {client.supervisorNotes}
            </p>
          </CardContent>
        </Card>
      )}
      {hasTags && (
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {client.tags?.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
