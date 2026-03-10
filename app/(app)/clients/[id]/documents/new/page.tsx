import { notFound, redirect } from "next/navigation";

import { DocumentGenerationForm } from "@/components/documents/document-generation-form";
import { auth } from "@/lib/auth";
import {
  getClientById,
  getClinicalDocumentsByClient,
  getClinicalNotesByClient,
  getTherapySessions,
} from "@/lib/db/queries";

export default async function NewDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }

  const { id: clientId } = await params;

  const [client, documents, notes, sessions] = await Promise.all([
    getClientById({ id: clientId }),
    getClinicalDocumentsByClient({
      clientId,
      therapistId: session.user.id,
    }),
    getClinicalNotesByClient({
      clientId,
      therapistId: session.user.id,
    }),
    getTherapySessions({
      therapistId: session.user.id,
      clientId,
    }),
  ]);

  if (!client || client.therapistId !== session.user.id) {
    notFound();
  }

  return (
    <DocumentGenerationForm
      clientId={clientId}
      clientName={client.name}
      existingDocuments={documents}
      clinicalNotes={notes}
      sessions={sessions}
    />
  );
}
