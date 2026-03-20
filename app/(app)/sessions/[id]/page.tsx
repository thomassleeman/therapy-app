import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  getClientById,
  getClinicalNotes,
  getLatestDocumentByType,
  getSessionConsents,
  getSessionSegments,
  getTherapySession,
} from "@/lib/db/queries";

import { SessionDetailClient } from "./session-detail-client";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;

  const therapySession = await getTherapySession({ id });
  if (!therapySession) {
    notFound();
  }
  if (therapySession.therapistId !== session.user.id) {
    notFound();
  }

  const [segments, notes, consents, client, caseFormulation] =
    await Promise.all([
      getSessionSegments({ sessionId: id }),
      getClinicalNotes({ sessionId: id }),
      getSessionConsents({ sessionId: id }),
      therapySession.clientId
        ? getClientById({ id: therapySession.clientId })
        : Promise.resolve(null),
      therapySession.clientId
        ? getLatestDocumentByType({
            clientId: therapySession.clientId,
            therapistId: session.user.id,
            documentType: "case_formulation",
          })
        : Promise.resolve(null),
    ]);

  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto">
      <SessionDetailClient
        caseFormulation={caseFormulation}
        clientId={therapySession.clientId ?? null}
        clientName={client?.name ?? null}
        consents={consents}
        notes={notes}
        segments={segments}
        session={therapySession}
      />
    </div>
  );
}
