"use client";

import { useState } from "react";
import { Chat } from "@/components/chat";
import { ClientPicker } from "@/components/client-picker";
import { DataStreamHandler } from "@/components/data-stream-handler";

export function NewChatWrapper({
  id,
  initialChatModel,
  preselectedClientId,
}: {
  id: string;
  initialChatModel: string;
  preselectedClientId?: string | null;
}) {
  // undefined = picker not yet answered, null = "General", string = specific client
  const [selectedClientId, setSelectedClientId] = useState<
    string | null | undefined
  >(preselectedClientId);

  if (selectedClientId === undefined) {
    return <ClientPicker onSelect={setSelectedClientId} />;
  }

  return (
    <>
      <Chat
        autoResume={false}
        id={id}
        initialChatModel={initialChatModel}
        initialClientId={selectedClientId}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
      />
      <DataStreamHandler />
    </>
  );
}
