import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  createTherapySession,
  getTherapySessions,
  updateTherapySession,
} from "@/lib/db/queries";
import type {
  ConsentingParty,
  ConsentType,
  RecordingType,
} from "@/lib/db/types";
import {
  CONSENT_TYPES,
  CONSENTING_PARTIES,
  RECORDING_TYPES,
} from "@/lib/db/types";
import { createClient } from "@/utils/supabase/server";

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

interface ConsentInput {
  consentType: string;
  consentingParty: string;
  consented: boolean;
  consentMethod: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    sessionDate,
    clientId,
    deliveryMethod,
    recordingType,
    writtenNotes,
    consents,
  } = body as {
    sessionDate: string;
    clientId?: string;
    deliveryMethod?: string;
    recordingType?: string;
    writtenNotes?: string;
    consents?: ConsentInput[];
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

  if (consents && consents.length > 0) {
    for (const c of consents) {
      if (!CONSENT_TYPES.includes(c.consentType as ConsentType)) {
        return NextResponse.json(
          {
            error: `Invalid consentType '${c.consentType}'. Must be one of: ${CONSENT_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      if (!CONSENTING_PARTIES.includes(c.consentingParty as ConsentingParty)) {
        return NextResponse.json(
          {
            error: `Invalid consentingParty '${c.consentingParty}'. Must be one of: ${CONSENTING_PARTIES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      if (typeof c.consented !== "boolean") {
        return NextResponse.json(
          { error: "consented must be a boolean" },
          { status: 400 }
        );
      }
      if (typeof c.consentMethod !== "string" || !c.consentMethod) {
        return NextResponse.json(
          { error: "consentMethod must be a non-empty string" },
          { status: 400 }
        );
      }
    }
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

  if (consents && consents.length > 0) {
    const supabase = await createClient();
    const consentRecords = consents.map((c) => ({
      session_id: therapySession.id,
      consent_type: c.consentType as ConsentType,
      consenting_party: c.consentingParty as ConsentingParty,
      consented: c.consented,
      consented_at: new Date().toISOString(),
      consent_method: c.consentMethod,
    }));

    const { error: consentError } = await supabase
      .from("session_consents")
      .insert(consentRecords);

    if (consentError) {
      await supabase
        .from("therapy_sessions")
        .delete()
        .eq("id", therapySession.id);
      return NextResponse.json(
        { error: "Failed to save consent records" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(therapySession, { status: 201 });
}
