import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getSessionConsents,
  getTherapySession,
  recordSessionConsent,
} from "@/lib/db/queries";
import type { ConsentingParty, ConsentType } from "@/lib/db/types";

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

  const consents = await getSessionConsents({ sessionId: id });
  return NextResponse.json({ consents });
}

export async function POST(
  request: Request,
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

  const body = await request.json();
  const { consentType, consentingParty, consented } = body as {
    consentType: ConsentType;
    consentingParty: ConsentingParty;
    consented: boolean;
  };

  if (!consentType || !consentingParty || consented === undefined) {
    return NextResponse.json(
      { error: "consentType, consentingParty, and consented are required" },
      { status: 400 }
    );
  }

  const consent = await recordSessionConsent({
    sessionId: id,
    consentType,
    consentingParty,
    consented,
    consentMethod: "in_app_checkbox",
  });

  return NextResponse.json(consent, { status: 201 });
}
