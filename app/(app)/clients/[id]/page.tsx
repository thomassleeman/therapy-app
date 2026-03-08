import { notFound, redirect } from "next/navigation";

import { ClientHubPage } from "@/components/client-hub-page";
import { auth } from "@/lib/auth";
import {
  getChatsByClientId,
  getClientById,
  getClinicalNotesByClient,
  getTherapySessions,
} from "@/lib/db/queries";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const client = await getClientById({ id });

  if (!client) {
    notFound();
  }

  if (client.therapistId !== session.user.id) {
    notFound();
  }

  const [chats, sessions, clinicalNotes] = await Promise.all([
    getChatsByClientId({ clientId: id, userId: session.user.id }),
    getTherapySessions({ therapistId: session.user.id, clientId: id }),
    getClinicalNotesByClient({ clientId: id, therapistId: session.user.id }),
  ]);

  return (
    <ClientHubPage
      chats={chats ?? []}
      client={client}
      clinicalNotes={clinicalNotes}
      sessions={sessions}
    />
  );
}
