"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  BirpNoteContent,
  Chat,
  Client,
  ClientStatus,
  ClinicalDocumentSummary,
  ClinicalNoteWithSession,
  DapNoteContent,
  DeliveryMethod,
  FreeformNoteContent,
  GirpNoteContent,
  NarrativeNoteContent,
  NoteFormat,
  NoteStatus,
  SessionFrequency,
  SoapNoteContent,
  TherapySession,
} from "@/lib/db/types";
import {
  AGE_BRACKET_LABELS,
  CLIENT_STATUS_LABELS,
  DELIVERY_METHOD_LABELS,
  NOTE_FORMATS,
  SESSION_FREQUENCY_LABELS,
} from "@/lib/db/types";
import type {
  ClinicalDocumentStatus,
  ClinicalDocumentType,
} from "@/lib/documents/types";
import {
  DOCUMENT_TYPE_REGISTRY,
  getDocumentTypeLabel,
} from "@/lib/documents/types";
import { formatDate } from "@/lib/utils";

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: "bg-green-600 text-white dark:bg-green-900 dark:text-green-200",
  paused: "bg-amber-600 text-white dark:bg-amber-900 dark:text-amber-200",
  discharged: "bg-gray-600 text-white dark:bg-gray-600 dark:text-gray-200",
  waitlisted: "bg-blue-600 text-white dark:bg-blue-900 dark:text-blue-200",
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
  clinicalDocuments: ClinicalDocumentSummary[];
  clinicalNotes: ClinicalNoteWithSession[];
  sessions: TherapySession[];
}

export function ClientHubPage({
  client,
  chats,
  clinicalDocuments,
  clinicalNotes,
  sessions,
}: ClientHubPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`);
  };

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
            <Link href={`/sessions/new?clientId=${client.id}`}>
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
        <SummaryStatsLine
          chatsCount={chats.length}
          clinicalNotesCount={clinicalNotes.length}
          sessionsCount={sessions.length}
          therapyStartDate={client.therapyStartDate}
        />
      </header>

      {/* Tabs */}
      <div className="flex-1 px-4 py-4 md:px-6">
        <Tabs onValueChange={handleTabChange} value={activeTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sessions">
              Sessions{sessions.length > 0 && ` (${sessions.length})`}
            </TabsTrigger>
            <TabsTrigger value="documents">
              Documents
              {clinicalDocuments.length > 0 && ` (${clinicalDocuments.length})`}
            </TabsTrigger>
            <TabsTrigger value="clinical-notes">
              Clinical Notes
              {clinicalNotes.length > 0 && ` (${clinicalNotes.length})`}
            </TabsTrigger>
            <TabsTrigger value="chats">
              Chats{chats.length > 0 && ` (${chats.length})`}
            </TabsTrigger>
            <TabsTrigger value="supervision">Supervision</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent className="mt-4" value="overview">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailsCard client={client} />
              <PracticeCard client={client} />
            </div>
            <OverviewStatsCards
              chatsCount={chats.length}
              clinicalNotesCount={clinicalNotes.length}
              sessionsCount={sessions.length}
              therapyStartDate={client.therapyStartDate}
            />
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent className="mt-4" value="sessions">
            <SessionsTab clientId={client.id} sessions={sessions} />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent className="mt-4" value="documents">
            <DocumentsTab clientId={client.id} documents={clinicalDocuments} />
          </TabsContent>

          {/* Clinical Notes Tab */}
          <TabsContent className="mt-4" value="clinical-notes">
            <ClinicalNotesTab notes={clinicalNotes} />
          </TabsContent>

          {/* Chats Tab */}
          <TabsContent className="mt-4" value="chats">
            <ChatsTab chats={chats} clientId={client.id} sessions={sessions} />
          </TabsContent>

          {/* Supervision Tab */}
          <TabsContent className="mt-4" value="supervision">
            <SupervisionTab client={client} />
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
            client.feePerSession === null
              ? null
              : `\u00A3${client.feePerSession}`
          }
        />
      </CardContent>
    </Card>
  );
}

function ChatsTab({
  chats,
  clientId,
  sessions,
}: {
  chats: Chat[];
  clientId: string;
  sessions: TherapySession[];
}) {
  // Build a map from chatId → session date for session-linked chats
  const chatSessionMap = new Map<string, string>();
  for (const session of sessions) {
    if (session.chatId) {
      chatSessionMap.set(session.chatId, session.sessionDate);
    }
  }

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
          {chats.map((chat, i) => {
            const linkedSessionDate = chatSessionMap.get(chat.id);
            return (
              <div key={chat.id}>
                {i > 0 && <Separator />}
                <Link
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
                  href={`/chat/${chat.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-medium">
                      {chat.title}
                    </span>
                    {linkedSessionDate && (
                      <Badge className="shrink-0 text-xs" variant="secondary">
                        Session: {formatShortDate(linkedSessionDate)}
                      </Badge>
                    )}
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                    {formatDate(chat.createdAt)}
                  </span>
                </Link>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionsTab({
  sessions,
  clientId,
}: {
  sessions: TherapySession[];
  clientId: string;
}) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8">
          <CardDescription>No sessions recorded yet.</CardDescription>
          <Link className="mt-4" href={`/sessions/new?clientId=${clientId}`}>
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
        <Link href={`/sessions/new?clientId=${clientId}`}>
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
                href={`/sessions/${session.id}?from=client`}
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

function SupervisionTab({ client }: { client: Client }) {
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

// ── Documents Tab ────────────────────────────────────────────────────

const DOC_TYPE_COLORS: Record<ClinicalDocumentType, string> = {
  comprehensive_assessment:
    "bg-blue-600 text-white dark:bg-blue-900 dark:text-blue-200",
  case_formulation:
    "bg-purple-600 text-white dark:bg-purple-900 dark:text-purple-200",
  treatment_plan:
    "bg-green-600 text-white dark:bg-green-900 dark:text-green-200",
  risk_assessment:
    "bg-amber-600 text-white dark:bg-amber-900 dark:text-amber-200",
  risk_safety_plan:
    "bg-amber-600 text-white dark:bg-amber-900 dark:text-amber-200",
  supervision_notes:
    "bg-slate-600 text-white dark:bg-slate-900 dark:text-slate-200",
  discharge_summary:
    "bg-gray-600 text-white dark:bg-gray-600 dark:text-gray-200",
};

const DOC_STATUS_COLORS: Record<ClinicalDocumentStatus, string> = {
  generating: "bg-gray-600 text-white dark:bg-gray-600 dark:text-gray-200",
  draft: "bg-yellow-600 text-white dark:bg-yellow-900 dark:text-yellow-200",
  reviewed: "bg-blue-600 text-white dark:bg-blue-900 dark:text-blue-200",
  finalised: "bg-green-600 text-white dark:bg-green-900 dark:text-green-200",
};

type DocFilterType = "all" | ClinicalDocumentType;

function DocumentsTab({
  documents,
  clientId,
}: {
  documents: ClinicalDocumentSummary[];
  clientId: string;
}) {
  const [filter, setFilter] = useState<DocFilterType>("all");

  // Build set of document types that exist for this client
  const existingTypes = new Set(documents.map((d) => d.documentType));

  // Check which advisory prerequisites are missing per document type
  const existingTypesSet = existingTypes;

  const filteredDocuments =
    filter === "all"
      ? documents
      : documents.filter((d) => d.documentType === filter);

  const filterOptions: { value: DocFilterType; label: string }[] = [
    { value: "all", label: "All" },
    ...Array.from(existingTypes).map((t) => ({
      value: t,
      label: DOCUMENT_TYPE_REGISTRY[t].label,
    })),
  ];

  if (documents.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <Link href={`/clients/${clientId}/documents/new`}>
            <Button size="sm">+ New Document</Button>
          </Link>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center py-8 text-center">
            <CardDescription>
              No clinical documents yet. Documents like assessments, treatment
              plans, and formulations help build a complete clinical record for
              this client.
            </CardDescription>
            <Link className="mt-4" href={`/clients/${clientId}/documents/new`}>
              <Button size="sm">Create First Document</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row: filters + new document */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {filterOptions.map((opt) => (
            <Button
              className="h-7 px-2.5 text-xs"
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              size="sm"
              variant={filter === opt.value ? "default" : "outline"}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <Link href={`/clients/${clientId}/documents/new`}>
          <Button size="sm">+ New Document</Button>
        </Link>
      </div>

      {/* Documents list */}
      {filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-8">
            <CardDescription>
              No {filter === "all" ? "" : getDocumentTypeLabel(filter)}{" "}
              documents found.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {filteredDocuments.map((doc, i) => (
              <div key={doc.id}>
                {i > 0 && <Separator />}
                <DocumentRow
                  clientId={clientId}
                  doc={doc}
                  missingPrereqs={getMissingPrerequisites(
                    doc.documentType,
                    existingTypesSet
                  )}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getMissingPrerequisites(
  docType: ClinicalDocumentType,
  existingTypes: Set<ClinicalDocumentType>
): string[] {
  const config = DOCUMENT_TYPE_REGISTRY[docType];
  if (config.advisoryPrerequisites.length === 0) {
    return [];
  }
  return config.advisoryPrerequisites
    .filter((prereq) => !existingTypes.has(prereq))
    .map((prereq) => DOCUMENT_TYPE_REGISTRY[prereq].label);
}

function DocumentRow({
  doc,
  clientId,
  missingPrereqs,
}: {
  doc: ClinicalDocumentSummary;
  clientId: string;
  missingPrereqs: string[];
}) {
  return (
    <Link
      className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
      href={`/clients/${clientId}/documents/${doc.id}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${DOC_TYPE_COLORS[doc.documentType]}`}
        >
          {getDocumentTypeLabel(doc.documentType)}
        </span>
        <span className="truncate text-sm font-medium">{doc.title}</span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[doc.status]}`}
        >
          {doc.status}
        </span>
        {doc.version > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            v{doc.version}
          </span>
        )}
        {doc.supersedesId && (
          <span className="shrink-0 text-xs text-muted-foreground italic">
            Superseded
          </span>
        )}
        {missingPrereqs.length > 0 && (
          <span
            className="shrink-0 text-xs text-amber-600 dark:text-amber-400"
            title={`Advisory: missing ${missingPrereqs.join(", ")}`}
          >
            ⓘ
          </span>
        )}
      </div>
      <span className="ml-4 shrink-0 text-xs text-muted-foreground">
        {formatShortDate(doc.createdAt)}
      </span>
    </Link>
  );
}

// ── Clinical Notes Tab ───────────────────────────────────────────────

const FORMAT_COLORS: Record<NoteFormat, string> = {
  soap: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  dap: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  birp: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  girp: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  narrative: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

const FORMAT_LABELS: Record<NoteFormat, string> = {
  soap: "SOAP",
  dap: "DAP",
  birp: "BIRP",
  girp: "GIRP",
  narrative: "Narrative",
};

const STATUS_BADGE_COLORS: Record<NoteStatus, string> = {
  draft:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  finalised:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

function getNotePreview(note: ClinicalNoteWithSession): string {
  const content = note.content;
  let text = "";
  if (note.noteFormat === "soap" && "subjective" in content) {
    text = (content as SoapNoteContent).subjective;
  } else if (note.noteFormat === "dap" && "data" in content) {
    text = (content as DapNoteContent).data;
  } else if (note.noteFormat === "birp" && "behaviour" in content) {
    text = (content as BirpNoteContent).behaviour;
  } else if (note.noteFormat === "girp" && "goals" in content) {
    text = (content as GirpNoteContent).goals;
  } else if (note.noteFormat === "narrative" && "clinicalOpening" in content) {
    text = (content as NarrativeNoteContent).clinicalOpening;
  } else if ("body" in content) {
    text = (content as FreeformNoteContent).body;
  }
  if (text.length > 100) {
    return `${text.slice(0, 100)}…`;
  }
  return text || "No content";
}

type FilterFormat = "all" | NoteFormat;

function ClinicalNotesTab({ notes }: { notes: ClinicalNoteWithSession[] }) {
  const [filter, setFilter] = useState<FilterFormat>("all");

  const filteredNotes =
    filter === "all" ? notes : notes.filter((n) => n.noteFormat === filter);

  const filterOptions: { value: FilterFormat; label: string }[] = [
    { value: "all", label: "All" },
    ...NOTE_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] })),
  ];

  if (notes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8">
          <CardDescription className="text-center">
            No clinical notes yet. Notes are generated from session transcripts.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row: filters + new note */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {filterOptions.map((opt) => (
            <Button
              className="h-7 px-2.5 text-xs"
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              size="sm"
              variant={filter === opt.value ? "default" : "outline"}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-8">
            <CardDescription>
              No {filter === "all" ? "" : FORMAT_LABELS[filter]} notes found.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {filteredNotes.map((note, i) => (
              <div key={note.id}>
                {i > 0 && <Separator />}
                <NoteRow note={note} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NoteRow({ note }: { note: ClinicalNoteWithSession }) {
  const inner = (
    <div className="flex flex-col gap-1.5 px-4 py-3 hover:bg-accent transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium">
            {formatShortDate(note.createdAt)}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FORMAT_COLORS[note.noteFormat]}`}
          >
            {FORMAT_LABELS[note.noteFormat]}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_COLORS[note.status]}`}
          >
            {note.status}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground truncate">
        {getNotePreview(note)}
      </p>
      {note.sessionId ? (
        <span className="text-xs text-muted-foreground">
          From session:{" "}
          <span className="underline">
            {note.sessionDate
              ? formatShortDate(note.sessionDate)
              : "Unknown date"}
          </span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Standalone note</span>
      )}
    </div>
  );

  if (note.sessionId) {
    return <Link href={`/sessions/${note.sessionId}`}>{inner}</Link>;
  }

  return inner;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getTimeInTherapy(startDate: string): string {
  const start = new Date(startDate);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (months < 1) {
    return "Less than a month";
  }
  if (months === 1) {
    return "1 month";
  }
  if (months < 12) {
    return `${months} months`;
  }
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  if (remaining === 0) {
    return `${years} year${years > 1 ? "s" : ""}`;
  }
  return `${years} year${years > 1 ? "s" : ""}, ${remaining} month${remaining > 1 ? "s" : ""}`;
}

interface StatsProps {
  therapyStartDate: string | null;
  sessionsCount: number;
  clinicalNotesCount: number;
  chatsCount: number;
}

function SummaryStatsLine({
  therapyStartDate,
  sessionsCount,
  clinicalNotesCount,
  chatsCount,
}: StatsProps) {
  const parts: string[] = [];
  if (therapyStartDate) {
    parts.push(`In therapy since ${formatShortDate(therapyStartDate)}`);
  }
  parts.push(`${sessionsCount} session${sessionsCount === 1 ? "" : "s"}`);
  parts.push(
    `${clinicalNotesCount} note${clinicalNotesCount === 1 ? "" : "s"}`
  );
  parts.push(`${chatsCount} reflective chat${chatsCount === 1 ? "" : "s"}`);

  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {parts.join(" \u00B7 ")}
    </p>
  );
}

function OverviewStatsCards({
  therapyStartDate,
  sessionsCount,
  clinicalNotesCount,
  chatsCount,
}: StatsProps) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-3xl font-bold">{sessionsCount}</p>
          <p className="text-sm text-muted-foreground">Total Sessions</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-3xl font-bold">{clinicalNotesCount}</p>
          <p className="text-sm text-muted-foreground">Total Notes</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-3xl font-bold">{chatsCount}</p>
          <p className="text-sm text-muted-foreground">Total Chats</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-base font-bold">
            {therapyStartDate ? getTimeInTherapy(therapyStartDate) : "N/A"}
          </p>
          <p className="text-sm text-muted-foreground">Time in Therapy</p>
        </CardContent>
      </Card>
    </div>
  );
}
