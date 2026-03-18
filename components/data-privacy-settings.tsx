"use client";

import { ChevronRight, Download, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteAllChatsAction,
  exportDataAction,
  requestAccountDeletionAction,
} from "@/app/(app)/settings/privacy/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataPrivacySettingsProps {
  userId: string;
  chatCount: number;
}

export function DataPrivacySettings({
  userId,
  chatCount: initialChatCount,
}: DataPrivacySettingsProps) {
  const [chatCount, setChatCount] = useState(initialChatCount);

  return (
    <div className="space-y-6">
      <DataHandlingCard />
      <DataRightsCard />
      <ChatDataCard
        chatCount={chatCount}
        onChatsDeleted={() => setChatCount(0)}
        userId={userId}
      />
      <LegalDocumentsCard />
      <DataProcessingDetailsCard />
    </div>
  );
}

function DataHandlingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">How Your Data is Handled</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium">Processing & storage</dt>
            <dd className="text-sm text-muted-foreground mt-1">
              Your data is processed and stored within EU/UK infrastructure. We
              use Anthropic Claude for AI responses and Cohere (via AWS
              eu-west-1) for knowledge base search. Neither provider trains on
              your data.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Database</dt>
            <dd className="text-sm text-muted-foreground mt-1">
              Chat conversations, session transcripts, and clinical notes are
              stored in a Supabase PostgreSQL database hosted in the EU.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Audio recordings</dt>
            <dd className="text-sm text-muted-foreground mt-1">
              Audio recordings are stored temporarily for transcription and can
              be configured for automatic deletion after processing.
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function DataRightsCard() {
  const router = useRouter();
  const [isExporting, startExportTransition] = useTransition();
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, startDeleteTransition] = useTransition();

  function handleExport() {
    startExportTransition(async () => {
      const result = await exportDataAction();
      if (result.success && result.data) {
        const blob = new Blob([result.data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `therapy-platform-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Your data export has been downloaded.");
      } else {
        toast.error(result.error ?? "Failed to export data.");
      }
    });
  }

  function handleAccountDeletion() {
    startDeleteTransition(async () => {
      const result = await requestAccountDeletionAction();
      if (result.success) {
        toast.success("Account deletion request submitted.");
        router.push("/login");
      } else {
        toast.error(result.error ?? "Failed to request account deletion.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Data Rights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-sm font-semibold">Access</p>
          <p className="text-sm text-muted-foreground mt-1">
            You can export all your data at any time.
          </p>
          <Button
            className="mt-2"
            disabled={isExporting}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download My Data
          </Button>
        </div>

        <div>
          <p className="text-sm font-semibold">Deletion</p>
          <p className="text-sm text-muted-foreground mt-1">
            You can request deletion of your account and all associated data.
          </p>
          <AlertDialog onOpenChange={() => setDeleteConfirmText("")}>
            <AlertDialogTrigger asChild>
              <Button className="mt-2" size="sm" variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Request Account Deletion
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action is permanent and irreversible. All chats,
                  sessions, clinical notes, client records, and profile data
                  will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <p className="text-sm text-muted-foreground mb-2">
                  Type <span className="font-mono font-semibold">DELETE</span>{" "}
                  to confirm.
                </p>
                <Input
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  value={deleteConfirmText}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteConfirmText !== "DELETE" || isDeletingAccount}
                  onClick={handleAccountDeletion}
                >
                  {isDeletingAccount && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete My Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div>
          <p className="text-sm font-semibold">Rectification</p>
          <p className="text-sm text-muted-foreground mt-1">
            You can update your personal information at any time through your
            profile and account settings.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold">Portability</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your exported data is provided in a standard JSON format that you
            can transfer to another service.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatDataCard({
  chatCount,
  onChatsDeleted,
  userId,
}: {
  chatCount: number;
  onChatsDeleted: () => void;
  userId: string;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, startTransition] = useTransition();

  function handleDeleteAllChats() {
    startTransition(async () => {
      const result = await deleteAllChatsAction(userId);
      if (result.success) {
        toast.success(`Deleted ${result.deletedCount ?? 0} conversations.`);
        onChatsDeleted();
      } else {
        toast.error(result.error ?? "Failed to delete chats.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Chat Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Retention policy</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your chat conversations are retained indefinitely and can be deleted
            individually or all at once. You have full control over your chat
            history.
          </p>
        </div>

        <div className="rounded-md border border-destructive/20 p-4">
          <p className="text-sm text-muted-foreground mb-3">
            You currently have{" "}
            <span className="font-semibold text-foreground">{chatCount}</span>{" "}
            {chatCount === 1 ? "conversation" : "conversations"}.
          </p>
          <AlertDialog onOpenChange={() => setConfirmText("")}>
            <AlertDialogTrigger asChild>
              <Button
                disabled={chatCount === 0}
                size="sm"
                variant="destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete All Chats
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all conversations?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {chatCount}{" "}
                  {chatCount === 1 ? "conversation" : "conversations"} and their
                  messages. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <p className="text-sm text-muted-foreground mb-2">
                  Type{" "}
                  <span className="font-mono font-semibold">delete all</span> to
                  confirm.
                </p>
                <Input
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="delete all"
                  value={confirmText}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={
                    confirmText.toLowerCase() !== "delete all" || isDeleting
                  }
                  onClick={handleDeleteAllChats}
                >
                  {isDeleting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete All Chats
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function LegalDocumentsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Legal Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2">
          <Link
            className="text-sm text-primary underline-offset-4 hover:underline"
            href="/privacy-policy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Privacy Policy
          </Link>
          <Link
            className="text-sm text-primary underline-offset-4 hover:underline"
            href="/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            Terms of Service
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Last updated: March 2026
        </p>
      </CardContent>
    </Card>
  );
}

function DataProcessingDetailsCard() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Data Processing Details</CardTitle>
      </CardHeader>
      <CardContent>
        <Collapsible onOpenChange={setIsOpen} open={isOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
            View detailed data processing information
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-5">
            <div>
              <p className="text-sm font-semibold">Lawful basis</p>
              <p className="text-sm text-muted-foreground mt-1">
                Legitimate interests (Article 6(1)(f) UK GDPR) for general
                processing; explicit consent (Article 9(2)(a)) for
                health-related data in your inputs.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold">Data controller</p>
              <p className="text-sm text-muted-foreground mt-1">
                Soundboard is the data controller. ICO registration: pending.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Sub-processors</p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Provider</TableHead>
                      <TableHead className="text-xs">Purpose</TableHead>
                      <TableHead className="text-xs">Data Region</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-sm">Anthropic</TableCell>
                      <TableCell className="text-sm">
                        AI chat responses
                      </TableCell>
                      <TableCell className="text-sm">EU</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-sm">
                        Cohere (via AWS)
                      </TableCell>
                      <TableCell className="text-sm">
                        Knowledge base search
                      </TableCell>
                      <TableCell className="text-sm">EU (eu-west-1)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-sm">Supabase</TableCell>
                      <TableCell className="text-sm">
                        Database & authentication
                      </TableCell>
                      <TableCell className="text-sm">EU</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-sm">Vercel</TableCell>
                      <TableCell className="text-sm">
                        Application hosting
                      </TableCell>
                      <TableCell className="text-sm">EU</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-sm">AssemblyAI</TableCell>
                      <TableCell className="text-sm">
                        Audio transcription
                      </TableCell>
                      <TableCell className="text-sm">EU (eu-west-1)</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold">Retention</p>
              <p className="text-sm text-muted-foreground mt-1">
                Chat conversations and clinical notes are retained until you
                delete them or delete your account. Audio recordings can be
                configured for automatic deletion after transcription.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
