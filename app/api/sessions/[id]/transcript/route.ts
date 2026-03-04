import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getSessionSegments,
  getSessionTranscriptText,
  getTherapySession,
} from "@/lib/db/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const therapySession = await getTherapySession({ id });
  if (!therapySession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (therapySession.therapistId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [segments, formattedTranscript] = await Promise.all([
    getSessionSegments({ sessionId: id }),
    getSessionTranscriptText({ sessionId: id }),
  ]);

  return NextResponse.json({
    session: therapySession,
    segments,
    formattedTranscript,
  });
}
