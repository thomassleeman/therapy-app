import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { auth } from "@/lib/auth";
import {
  getChatById,
  getMessagesByChatId,
  getTherapistProfile,
  getTherapySession,
} from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <ChatPage params={props.params} />
    </Suspense>
  );
}

async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await getChatById({ id });

  if (!chat) {
    redirect("/");
  }

  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  if (!session.user) {
    return notFound();
  }

  if (session.user.id !== chat.userId) {
    return notFound();
  }

  const [messagesFromDb, cookieStore, therapySession, therapistProfile] =
    await Promise.all([
      getMessagesByChatId({ id }),
      cookies(),
      chat.sessionId
        ? getTherapySession({ id: chat.sessionId })
        : Promise.resolve(null),
      getTherapistProfile({ userId: session.user.id }),
    ]);

  const uiMessages = convertToUIMessages(messagesFromDb);
  const chatModelFromCookie = cookieStore.get("chat-model");
  const chatModel = chatModelFromCookie?.value ?? DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        autoResume={true}
        defaultModality={therapistProfile?.defaultModality ?? null}
        hasProfile={therapistProfile !== null}
        id={chat.id}
        initialChatModel={chatModel}
        initialClientId={chat.clientId}
        initialMessages={uiMessages}
        initialSessionDate={therapySession?.sessionDate ?? null}
        initialSessionId={chat.sessionId}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler />
    </>
  );
}
