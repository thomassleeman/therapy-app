import { notFound, redirect } from "next/navigation";

import { DocumentViewer } from "@/components/documents/document-viewer";
import { auth } from "@/lib/auth";
import { getClientById, getClinicalDocument } from "@/lib/db/queries";
import { DOCUMENT_TYPE_REGISTRY } from "@/lib/documents/types";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }

  const { id: clientId, documentId } = await params;

  const [document, client] = await Promise.all([
    getClinicalDocument({ id: documentId, therapistId: session.user.id }),
    getClientById({ id: clientId }),
  ]);

  if (!document || !client) {
    notFound();
  }

  if (
    document.clientId !== clientId ||
    client.therapistId !== session.user.id
  ) {
    notFound();
  }

  const typeConfig = DOCUMENT_TYPE_REGISTRY[document.documentType];

  return (
    <DocumentViewer
      clientId={clientId}
      clientName={client.name}
      document={document}
      typeConfig={typeConfig}
    />
  );
}
