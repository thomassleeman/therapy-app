"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { ClientDialog } from "@/components/client-dialog";
import { ClientSelector } from "@/components/client-selector";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatClient } from "@/hooks/use-chat-client";
import { useClients } from "@/hooks/use-clients";
import type { TherapeuticOrientation } from "@/lib/ai/prompts";
import { ChevronDownIcon, PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";

const DISPLAY_TO_ORIENTATION: Record<string, TherapeuticOrientation> = {
  CBT: "cbt",
  "Person-Centred": "person-centred",
  Psychodynamic: "psychodynamic",
  Integrative: "integrative",
  Systemic: "systemic",
  Existential: "existential",
};

function toOrientation(display: string): TherapeuticOrientation {
  return DISPLAY_TO_ORIENTATION[display] ?? "integrative";
}

function ApproachSelector({
  chatId,
  onApproachChange,
}: {
  chatId: string;
  onApproachChange: (orientation: TherapeuticOrientation) => void;
}) {
  const { clients } = useClients();
  const { clientId: selectedClientId } = useChatClient({
    chatId,
    initialClientId: null,
  });
  const [selectedApproach, setSelectedApproach] = useState<string>("General");

  const modalities = useMemo(() => {
    if (!selectedClientId) {
      return [];
    }
    const client = clients.find((c) => c.id === selectedClientId);
    return client?.therapeuticModalities ?? [];
  }, [clients, selectedClientId]);

  useEffect(() => {
    let next: string;
    if (modalities.length >= 1) {
      next = modalities[0];
    } else {
      next = "General";
    }
    setSelectedApproach(next);
    onApproachChange(toOrientation(next));
  }, [modalities, onApproachChange]);

  const hasMultiple = modalities.length > 1;

  const pill = (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 dark:border-blue-800 dark:bg-blue-950">
      <span className="text-xs text-muted-foreground">Approach:</span>
      <span className="text-xs font-medium">{selectedApproach}</span>
      {hasMultiple && <ChevronDownIcon />}
    </div>
  );

  if (!hasMultiple) {
    return pill;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer" type="button">
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {modalities.map((modality) => (
          <DropdownMenuItem
            key={modality}
            onSelect={() => {
              setSelectedApproach(modality);
              onApproachChange(toOrientation(modality));
            }}
          >
            {modality}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionBadge({
  sessionId,
  sessionDate,
}: {
  sessionId: string;
  sessionDate: string;
}) {
  const formatted = new Date(sessionDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link
      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      href={`/sessions/${sessionId}`}
    >
      📎 Session: {formatted}
    </Link>
  );
}

function PureChatHeader({
  chatId,
  selectedClientId,
  sessionId,
  sessionDate,
  isReadonly,
  onApproachChange,
}: {
  chatId: string;
  selectedClientId: string | null;
  sessionId: string | null;
  sessionDate: string | null;
  isReadonly: boolean;
  onApproachChange: (orientation: TherapeuticOrientation) => void;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const [showClientDialog, setShowClientDialog] = useState(false);
  const { clientId } = useChatClient({
    chatId,
    initialClientId: selectedClientId,
  });

  const { width: windowWidth } = useWindowSize();

  return (
    <>
      <header className="sticky top-0 flex flex-wrap items-center gap-2 bg-background px-2 py-1.5 md:px-2">
        <SidebarToggle />

        {(!open || windowWidth < 768) && (
          <Button
            className="order-2 ml-auto h-8 px-2 md:order-1 md:ml-0 md:h-fit md:px-2"
            onClick={() => {
              router.push("/chat/new");
              router.refresh();
            }}
            variant="outline"
          >
            <PlusIcon />
            <span className="md:sr-only">New Chat</span>
          </Button>
        )}

        {!isReadonly && (
          <ClientSelector
            chatId={chatId}
            className="order-1 md:order-2"
            onCreateClient={() => setShowClientDialog(true)}
            selectedClientId={selectedClientId}
          />
        )}

        {clientId && (
          <Link
            className="order-2 text-xs text-muted-foreground transition-colors hover:text-foreground md:order-3"
            href={`/clients/${clientId}`}
          >
            View client →
          </Link>
        )}

        {sessionId && sessionDate && (
          <div className="order-4">
            <SessionBadge sessionDate={sessionDate} sessionId={sessionId} />
          </div>
        )}

        {!isReadonly && (
          <div className="order-5 w-full md:w-auto">
            <ApproachSelector
              chatId={chatId}
              onApproachChange={onApproachChange}
            />
          </div>
        )}
      </header>

      <ClientDialog
        onOpenChange={setShowClientDialog}
        open={showClientDialog}
      />
    </>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedClientId === nextProps.selectedClientId &&
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.sessionDate === nextProps.sessionDate &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.onApproachChange === nextProps.onApproachChange
  );
});
