"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useState } from "react";
import { ClientDialog } from "@/components/client-dialog";
import { ClientSelector } from "@/components/client-selector";
import { SidebarToggle } from "@/components/sidebar-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatClient } from "@/hooks/use-chat-client";
import { useClients } from "@/hooks/use-clients";
import type { TherapeuticOrientation } from "@/lib/ai/prompts";
import { ChevronDownIcon } from "./icons";

const DISPLAY_TO_ORIENTATION: Record<string, TherapeuticOrientation> = {
  CBT: "cbt",
  "Person-Centred": "person-centred",
  Psychodynamic: "psychodynamic",
  Integrative: "integrative",
  Systemic: "systemic",
  Existential: "existential",
  MCT: "mct",
  ACT: "act",
};

const ORIENTATION_TO_DISPLAY: Record<string, string> = {
  cbt: "CBT",
  "person-centred": "Person-Centred",
  psychodynamic: "Psychodynamic",
  integrative: "Integrative",
  systemic: "Systemic",
  existential: "Existential",
  mct: "MCT",
  act: "ACT",
};

const ALL_DISPLAY_OPTIONS = [
  "Integrative",
  "CBT",
  "Person-Centred",
  "Psychodynamic",
  "MCT",
  "ACT",
  "Systemic",
  "Existential",
];

function toOrientation(display: string): TherapeuticOrientation {
  return DISPLAY_TO_ORIENTATION[display] ?? "integrative";
}

function toDisplay(dbModality: string | null): string {
  if (!dbModality) {
    return "Integrative";
  }
  return ORIENTATION_TO_DISPLAY[dbModality] ?? "Integrative";
}

function ApproachSelector({
  chatId,
  defaultModality,
  onApproachChange,
}: {
  chatId: string;
  defaultModality: string | null;
  onApproachChange: (orientation: TherapeuticOrientation) => void;
}) {
  const { clients } = useClients();
  const { clientId: selectedClientId } = useChatClient({
    chatId,
    initialClientId: null,
  });

  const therapistDefault = toDisplay(defaultModality);

  const [selectedApproach, setSelectedApproach] =
    useState<string>(therapistDefault);

  const clientModalities = useMemo(() => {
    if (!selectedClientId) {
      return [];
    }
    const client = clients.find((c) => c.id === selectedClientId);
    return client?.therapeuticModalities ?? [];
  }, [clients, selectedClientId]);

  // Build the list of options to show in the dropdown
  const options = useMemo(() => {
    if (clientModalities.length > 0) {
      // Client has modalities — show those plus Integrative as a fallback
      const items = [...clientModalities];
      if (!items.includes("Integrative")) {
        items.push("Integrative");
      }
      return items;
    }
    // No client or no modalities — show the full set
    return ALL_DISPLAY_OPTIONS;
  }, [clientModalities]);

  // Reset selected approach when client changes
  useEffect(() => {
    let next: string;
    if (clientModalities.length >= 1) {
      next = clientModalities[0];
    } else {
      next = therapistDefault;
    }
    setSelectedApproach(next);
    onApproachChange(toOrientation(next));
  }, [clientModalities, therapistDefault, onApproachChange]);

  const hasDropdown = options.length > 1;

  const pill = (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 dark:border-blue-800 dark:bg-blue-950">
      <span className="text-xs text-muted-foreground">Approach:</span>
      <span className="text-xs font-medium">{selectedApproach}</span>
      {hasDropdown && <ChevronDownIcon />}
    </div>
  );

  if (!hasDropdown) {
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
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => {
              setSelectedApproach(option);
              onApproachChange(toOrientation(option));
            }}
          >
            {option}
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
  defaultModality,
  selectedClientId,
  sessionId,
  sessionDate,
  isReadonly,
  onApproachChange,
}: {
  chatId: string;
  defaultModality: string | null;
  selectedClientId: string | null;
  sessionId: string | null;
  sessionDate: string | null;
  isReadonly: boolean;
  onApproachChange: (orientation: TherapeuticOrientation) => void;
}) {
  const [showClientDialog, setShowClientDialog] = useState(false);
  const { clientId } = useChatClient({
    chatId,
    initialClientId: selectedClientId,
  });


  return (
    <>
      <header className="sticky top-0 flex flex-wrap items-center gap-2 bg-background px-2 py-1.5 md:px-2">
        <SidebarToggle />

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
              defaultModality={defaultModality}
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
    prevProps.defaultModality === nextProps.defaultModality &&
    prevProps.selectedClientId === nextProps.selectedClientId &&
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.sessionDate === nextProps.sessionDate &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.onApproachChange === nextProps.onApproachChange
  );
});
