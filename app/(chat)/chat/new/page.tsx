import { Suspense } from "react";
import { NewChatWrapper } from "@/components/new-chat-wrapper";
import { auth } from "@/lib/auth";
import { getTherapistProfile, getTherapySession } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; sessionId?: string }>;
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
  searchParams: Promise<{ clientId?: string; sessionId?: string }>;
}) {
  const [resolvedParams, session] = await Promise.all([searchParams, auth()]);

  const therapistProfile = session
    ? await getTherapistProfile({ userId: session.user.id })
    : null;

  const id = generateUUID();

  // If ?clientId is provided, skip the picker and pre-select that client
  // "general" maps to null (no client), absent = undefined (show picker)
  const preselectedClientId =
    resolvedParams.clientId === "general"
      ? null
      : (resolvedParams.clientId ?? undefined);

  // If ?sessionId is provided, pass it through so the chat can load transcript context
  const sessionId = resolvedParams.sessionId ?? null;
  const therapySession = sessionId
    ? await getTherapySession({ id: sessionId })
    : null;

  return (
    <NewChatWrapper
      defaultModality={therapistProfile?.defaultModality ?? null}
      hasProfile={therapistProfile !== null}
      id={id}
      preselectedClientId={preselectedClientId}
      sessionDate={therapySession?.sessionDate ?? null}
      sessionId={sessionId}
    />
  );
}
