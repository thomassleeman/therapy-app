"use client";

import { useState } from "react";
import { Chat } from "@/components/chat";
import { ClientPicker } from "@/components/client-picker";
import { DataStreamHandler } from "@/components/data-stream-handler";

export function NewChatWrapper({
  id,
  defaultModality,
  hasProfile,
  preselectedClientId,
  sessionId,
  sessionDate,
}: {
  id: string;
  defaultModality: string | null;
  hasProfile?: boolean;
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
        defaultModality={defaultModality}
        hasProfile={hasProfile}
        id={id}
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
