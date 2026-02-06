"use client";

import type { User } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { useClients } from "@/hooks/use-clients";
import type { Chat, Client } from "@/lib/db/types";
import { fetcher } from "@/lib/utils";
import { ChevronDownIcon, LoaderIcon, UserIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";

type GroupedChatsByClient = {
  uncategorized: Chat[];
  byClient: Array<{ client: Client; chats: Chat[] }>;
};

export type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

const PAGE_SIZE = 20;

const groupChatsByClient = (
  chats: Chat[],
  clients: Client[]
): GroupedChatsByClient => {
  const clientMap = new Map<string, Client>();
  for (const client of clients) {
    clientMap.set(client.id, client);
  }

  const uncategorized: Chat[] = [];
  const byClientMap = new Map<string, Chat[]>();

  for (const chat of chats) {
    if (chat.clientId) {
      const existing = byClientMap.get(chat.clientId) || [];
      existing.push(chat);
      byClientMap.set(chat.clientId, existing);
    } else {
      uncategorized.push(chat);
    }
  }

  // Sort chats within each group by date (newest first)
  uncategorized.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const byClient: Array<{ client: Client; chats: Chat[] }> = [];
  for (const [clientId, clientChats] of byClientMap) {
    const client = clientMap.get(clientId);
    if (client) {
      clientChats.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      byClient.push({ client, chats: clientChats });
    } else {
      // Client was deleted but chats still have the clientId (shouldn't happen with SET NULL)
      uncategorized.push(...clientChats);
    }
  }

  // Sort clients alphabetically by name
  byClient.sort((a, b) => a.client.name.localeCompare(b.client.name));

  return { uncategorized, byClient };
};

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) {
    return `/api/history?limit=${PAGE_SIZE}`;
  }

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) {
    return null;
  }

  return `/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
}

function ClientSection({
  client,
  chats,
  activeId,
  onDelete,
  setOpenMobile,
}: {
  client: Client;
  chats: Chat[];
  activeId: string | null;
  onDelete: (chatId: string) => void;
  setOpenMobile: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1 text-sidebar-foreground/50 text-xs hover:text-sidebar-foreground transition-colors">
        <motion.div
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDownIcon />
        </motion.div>
        <UserIcon />
        <span className="truncate flex-1 text-left">{client.name}</span>
        <span className="text-sidebar-foreground/30">{chats.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4">
          {chats.map((chat) => (
            <ChatItem
              chat={chat}
              isActive={chat.id === activeId}
              key={chat.id}
              onDelete={onDelete}
              setOpenMobile={setOpenMobile}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SidebarHistory({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const id = pathname?.startsWith("/chat/") ? pathname.split("/")[2] : null;

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
  });

  const { clients, isLoading: isLoadingClients } = useClients();

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [uncategorizedOpen, setUncategorizedOpen] = useState(true);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;

  const chatsFromHistory = useMemo(
    () =>
      paginatedChatHistories?.flatMap(
        (paginatedChatHistory) => paginatedChatHistory.chats
      ) ?? [],
    [paginatedChatHistories]
  );

  const groupedChats = useMemo(
    () => groupChatsByClient(chatsFromHistory, clients),
    [chatsFromHistory, clients]
  );

  const handleDelete = () => {
    const chatToDelete = deleteId;
    const isCurrentChat = pathname === `/chat/${chatToDelete}`;

    setShowDeleteDialog(false);

    const deletePromise = fetch(`/api/chat?id=${chatToDelete}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting chat...",
      success: () => {
        mutate((chatHistories) => {
          if (chatHistories) {
            return chatHistories.map((chatHistory) => ({
              ...chatHistory,
              chats: chatHistory.chats.filter(
                (chat) => chat.id !== chatToDelete
              ),
            }));
          }
        });

        if (isCurrentChat) {
          router.replace("/");
          router.refresh();
        }

        return "Chat deleted successfully";
      },
      error: "Failed to delete chat",
    });
  };

  const onDeleteChat = (chatId: string) => {
    setDeleteId(chatId);
    setShowDeleteDialog(true);
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            Login to save and revisit previous chats!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading || isLoadingClients) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
          Loading...
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                className="flex h-8 items-center gap-2 rounded-md px-2"
                key={item}
              >
                <div
                  className="h-4 max-w-(--skeleton-width) flex-1 rounded-md bg-sidebar-accent-foreground/10"
                  style={
                    {
                      "--skeleton-width": `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            Your conversations will appear here once you start chatting!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <div className="flex flex-col gap-4">
              {/* Client sections */}
              {groupedChats.byClient.map(({ client, chats }) => (
                <ClientSection
                  activeId={id}
                  chats={chats}
                  client={client}
                  key={client.id}
                  onDelete={onDeleteChat}
                  setOpenMobile={setOpenMobile}
                />
              ))}

              {/* Uncategorized section */}
              {groupedChats.uncategorized.length > 0 && (
                <Collapsible
                  onOpenChange={setUncategorizedOpen}
                  open={uncategorizedOpen}
                >
                  <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1 text-sidebar-foreground/50 text-xs hover:text-sidebar-foreground transition-colors">
                    <motion.div
                      animate={{ rotate: uncategorizedOpen ? 0 : -90 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDownIcon />
                    </motion.div>
                    <span className="truncate flex-1 text-left">
                      Uncategorized
                    </span>
                    <span className="text-sidebar-foreground/30">
                      {groupedChats.uncategorized.length}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-4">
                      {groupedChats.uncategorized.map((chat) => (
                        <ChatItem
                          chat={chat}
                          isActive={chat.id === id}
                          key={chat.id}
                          onDelete={onDeleteChat}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </SidebarMenu>

          <motion.div
            onViewportEnter={() => {
              if (!isValidating && !hasReachedEnd) {
                setSize((size) => size + 1);
              }
            }}
          />

          {hasReachedEnd ? (
            <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
              You have reached the end of your chat history.
            </div>
          ) : (
            <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div>Loading Chats...</div>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
