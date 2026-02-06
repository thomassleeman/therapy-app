"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatClient } from "@/hooks/use-chat-client";
import { useClients } from "@/hooks/use-clients";
import { cn } from "@/lib/utils";
import {
  CheckCircleFillIcon,
  ChevronDownIcon,
  PlusIcon,
  UserIcon,
} from "./icons";

export function ClientSelector({
  chatId,
  className,
  selectedClientId,
  onCreateClient,
}: {
  chatId: string;
  selectedClientId: string | null;
  onCreateClient?: () => void;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const { clients, isLoading } = useClients();

  const { clientId, setClientId } = useChatClient({
    chatId,
    initialClientId: selectedClientId,
  });

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId),
    [clients, clientId]
  );

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          "w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          className
        )}
      >
        <Button
          className="hidden h-8 md:flex md:h-fit md:px-2"
          data-testid="client-selector"
          variant="outline"
        >
          <UserIcon />
          <span className="max-w-[100px] truncate md:sr-only lg:not-sr-only">
            {selectedClient?.name ?? "No Client"}
          </span>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[250px]">
        <DropdownMenuItem
          className="group/item flex flex-row items-center justify-between gap-4"
          data-active={clientId === null}
          data-testid="client-selector-item-none"
          onSelect={() => {
            setClientId(null);
            setOpen(false);
          }}
        >
          <div className="flex flex-col items-start gap-1">
            <span>No Client</span>
            <span className="text-muted-foreground text-xs">
              Chat without client assignment
            </span>
          </div>
          <div className="text-foreground opacity-0 group-data-[active=true]/item:opacity-100 dark:text-foreground">
            <CheckCircleFillIcon />
          </div>
        </DropdownMenuItem>

        {!isLoading && clients.length > 0 && <DropdownMenuSeparator />}

        {isLoading ? (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground text-sm">
              Loading clients...
            </span>
          </DropdownMenuItem>
        ) : (
          clients.map((client) => (
            <DropdownMenuItem
              className="group/item flex flex-row items-center justify-between gap-4"
              data-active={client.id === clientId}
              data-testid={`client-selector-item-${client.id}`}
              key={client.id}
              onSelect={() => {
                setClientId(client.id);
                setOpen(false);
              }}
            >
              <div className="flex flex-col items-start gap-1">
                <span className="truncate max-w-[180px]">{client.name}</span>
              </div>
              <div className="text-foreground opacity-0 group-data-[active=true]/item:opacity-100 dark:text-foreground">
                <CheckCircleFillIcon />
              </div>
            </DropdownMenuItem>
          ))
        )}

        {onCreateClient && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex flex-row items-center gap-2"
              onSelect={() => {
                onCreateClient();
                setOpen(false);
              }}
            >
              <PlusIcon />
              <span>Create New Client</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
