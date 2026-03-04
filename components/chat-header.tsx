"use client";

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
import { useClients } from "@/hooks/use-clients";
import { ChevronDownIcon, PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";

function ApproachSelector({
  selectedClientId,
}: {
  selectedClientId: string | null;
}) {
  const { clients } = useClients();
  const [selectedApproach, setSelectedApproach] = useState<string>("General");

  const modalities = useMemo(() => {
    if (!selectedClientId) {
      return [];
    }
    const client = clients.find((c) => c.id === selectedClientId);
    return client?.therapeuticModalities ?? [];
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (modalities.length === 1) {
      setSelectedApproach(modalities[0]);
    } else if (modalities.length > 1) {
      setSelectedApproach(modalities[0]);
    } else {
      setSelectedApproach("General");
    }
  }, [modalities]);

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
            onSelect={() => setSelectedApproach(modality)}
          >
            {modality}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PureChatHeader({
  chatId,
  selectedClientId,
  isReadonly,
}: {
  chatId: string;
  selectedClientId: string | null;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const [showClientDialog, setShowClientDialog] = useState(false);

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

        {!isReadonly && (
          <div className="order-3 w-full md:w-auto">
            <ApproachSelector selectedClientId={selectedClientId} />
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
    prevProps.isReadonly === nextProps.isReadonly
  );
});
