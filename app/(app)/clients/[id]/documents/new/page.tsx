import { notFound, redirect } from "next/navigation";

import { DocumentGenerationForm } from "@/components/documents/document-generation-form";
import { auth } from "@/lib/auth";
import {
  getClientById,
  getClinicalDocumentsByClient,
  getClinicalNotesByClient,
  getTherapySessions,
} from "@/lib/db/queries";
import { buildDataAvailability } from "@/lib/documents/build-data-availability";

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

  const dataAvailability = buildDataAvailability({
    client: {
      presentingIssues: client.presentingIssues,
      treatmentGoals: client.treatmentGoals,
      riskConsiderations: client.riskConsiderations,
    },
    sessions: sessions.map((s) => ({
      transcriptionStatus: s.transcriptionStatus,
    })),
    notes: notes.map((n) => ({ status: n.status })),
    documents: documents.map((d) => ({
      documentType: d.documentType,
      status: d.status,
    })),
  });

  return (
    <DocumentGenerationForm
      clientId={clientId}
      clientName={client.name}
      clinicalNotes={notes}
      dataAvailability={dataAvailability}
      existingDocuments={documents}
      sessions={sessions}
    />
  );
}
