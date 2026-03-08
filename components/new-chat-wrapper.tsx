"use client";

import { useState } from "react";
import { Chat } from "@/components/chat";
import { ClientPicker } from "@/components/client-picker";
import { DataStreamHandler } from "@/components/data-stream-handler";

export function NewChatWrapper({
  id,
  initialChatModel,
  preselectedClientId,
  sessionId,
  sessionDate,
}: {
  id: string;
  initialChatModel: string;
  preselectedClientId?: string | null;
  sessionId?: string | null;
  sessionDate?: string | null;
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
        initialSessionDate={sessionDate ?? null}
        initialSessionId={sessionId ?? null}
        isReadonly={false}
        key={id}
      />
      <DataStreamHandler />
    </>
  );
}
