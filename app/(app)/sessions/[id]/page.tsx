import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  getClinicalNotes,
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

  const [segments, notes, consents] = await Promise.all([
    getSessionSegments({ sessionId: id }),
    getClinicalNotes({ sessionId: id }),
    getSessionConsents({ sessionId: id }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <SessionDetailClient
        consents={consents}
        notes={notes}
        segments={segments}
        session={therapySession}
      />
    </div>
  );
}
