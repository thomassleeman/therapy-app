import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getClinicalNotes,
  getTherapySession,
  updateClinicalNote,
  updateTherapySession,
} from "@/lib/db/queries";
import type { NoteContent, NoteStatus } from "@/lib/db/types";

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

  const notes = await getClinicalNotes({ sessionId: id });
  return NextResponse.json({ notes });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = await request.json();
  const { noteId, content, status, reviewedAt } = body as {
    noteId: string;
    content?: NoteContent;
    status?: NoteStatus;
    reviewedAt?: string;
  };

  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 });
  }

  // Verify session ownership
  const therapySession = await getTherapySession({ id });
  if (!therapySession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (therapySession.therapistId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updatedNote = await updateClinicalNote({
    id: noteId,
    content,
    status,
    reviewedAt,
  });

  // Keep therapy_sessions.notes_status in sync with clinical note status
  if (status === "finalised") {
    await updateTherapySession({ id, notesStatus: "finalised" });
  }

  return NextResponse.json(updatedNote);
}
