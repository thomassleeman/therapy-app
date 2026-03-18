import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  createTherapySession,
  getTherapySessions,
  updateTherapySession,
} from "@/lib/db/queries";
import type { RecordingType } from "@/lib/db/types";
import { RECORDING_TYPES } from "@/lib/db/types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId") ?? undefined;
  const limit = searchParams.get("limit")
    ? Number(searchParams.get("limit"))
    : undefined;
  const offset = searchParams.get("offset")
    ? Number(searchParams.get("offset"))
    : undefined;

  const sessions = await getTherapySessions({
    therapistId: session.user.id,
    clientId,
    limit,
    offset,
  });

  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { sessionDate, clientId, deliveryMethod, recordingType, writtenNotes } =
    body as {
      sessionDate: string;
      clientId?: string;
      deliveryMethod?: string;
      recordingType?: string;
      writtenNotes?: string;
    };

  if (!sessionDate) {
    return NextResponse.json(
      { error: "sessionDate is required" },
      { status: 400 }
    );
  }

  if (
    recordingType &&
    !RECORDING_TYPES.includes(recordingType as RecordingType)
  ) {
    return NextResponse.json(
      {
        error:
          "recordingType must be 'full_session', 'therapist_summary', or 'written_notes'",
      },
      { status: 400 }
    );
  }

  const therapySession = await createTherapySession({
    therapistId: session.user.id,
    sessionDate,
    clientId: clientId || null,
    deliveryMethod: deliveryMethod || null,
    ...(recordingType ? { recordingType: recordingType as RecordingType } : {}),
    ...(writtenNotes ? { writtenNotes } : {}),
  });

  if (recordingType === "written_notes") {
    await updateTherapySession({
      id: therapySession.id,
      transcriptionStatus: "not_applicable",
    });
  }

  return NextResponse.json(therapySession, { status: 201 });
}
