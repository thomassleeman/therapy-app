import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  deleteTherapySession,
  getClinicalNotes,
  getSessionConsents,
  getTherapySession,
} from "@/lib/db/queries";
import { createClient } from "@/utils/supabase/server";

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

  const [consents, notes] = await Promise.all([
    getSessionConsents({ sessionId: id }),
    getClinicalNotes({ sessionId: id }),
  ]);

  return NextResponse.json({
    session: therapySession,
    consents,
    notes,
  });
}

export async function DELETE(
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

  // Delete audio from storage if it exists
  if (therapySession.audioStoragePath) {
    const supabase = await createClient();
    const { error: storageError } = await supabase.storage
      .from("session-audio")
      .remove([therapySession.audioStoragePath]);

    if (storageError) {
      console.error("Failed to delete audio from storage:", storageError);
      // Continue with session deletion even if storage cleanup fails
    }
  }

  // Delete session (cascades to segments, notes, consents)
  await deleteTherapySession({ id });

  return NextResponse.json({ success: true });
}
