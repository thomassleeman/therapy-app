"use client";

import { useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { updateChatClient } from "@/app/(chat)/actions";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "@/components/sidebar-history";

export function useChatClient({
  chatId,
  initialClientId,
}: {
  chatId: string;
  initialClientId: string | null;
}) {
  const { mutate, cache } = useSWRConfig();
  const history: ChatHistory = cache.get("/api/history")?.data;

  const { data: localClientId, mutate: setLocalClientId } = useSWR(
    `${chatId}-client`,
    null,
    {
      fallbackData: initialClientId,
    }
  );

  const clientId = useMemo(() => {
    if (!history) {
      return localClientId;
    }
    const chat = history.chats.find((currentChat) => currentChat.id === chatId);
    if (!chat) {
      return null;
    }
    return chat.clientId ?? null;
  }, [history, chatId, localClientId]);

  const setClientId = (updatedClientId: string | null) => {
    setLocalClientId(updatedClientId);
    mutate(unstable_serialize(getChatHistoryPaginationKey));

    updateChatClient({
      chatId,
      clientId: updatedClientId,
    });
  };

  return { clientId, setClientId };
}
