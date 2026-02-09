"use client";

import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { ClientDialog } from "@/components/client-dialog";
import { ClientSelector } from "@/components/client-selector";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
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
      <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
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
