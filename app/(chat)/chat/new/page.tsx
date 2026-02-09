import { cookies } from "next/headers";
import { Suspense } from "react";
import { NewChatWrapper } from "@/components/new-chat-wrapper";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <NewChatPage searchParams={searchParams} />
    </Suspense>
  );
}

async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const [cookieStore, resolvedParams] = await Promise.all([
    cookies(),
    searchParams,
  ]);

  const modelIdFromCookie = cookieStore.get("chat-model");
  const id = generateUUID();
  const chatModel = modelIdFromCookie?.value ?? DEFAULT_CHAT_MODEL;

  // If ?clientId is provided, skip the picker and pre-select that client
  // "general" maps to null (no client), absent = undefined (show picker)
  const preselectedClientId =
    resolvedParams.clientId === "general"
      ? null
      : (resolvedParams.clientId ?? undefined);

  return (
    <NewChatWrapper
      id={id}
      initialChatModel={chatModel}
      preselectedClientId={preselectedClientId}
    />
  );
}
