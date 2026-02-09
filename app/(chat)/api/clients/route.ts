import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createClientRecord, getClientsByUserId } from "@/lib/db/queries";
import {
  AGE_BRACKETS,
  CLIENT_STATUSES,
  DELIVERY_METHODS,
  SESSION_FREQUENCIES,
} from "@/lib/db/types";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const clients = await getClientsByUserId({ userId: session.user.id });

  return Response.json(clients);
}

// Validate that a value is one of the allowed enum values, or null/undefined
function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string
): T | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new ChatSDKError(
      "bad_request:api",
      `Invalid ${fieldName}: ${String(value)}`
    );
  }
  return value as T;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
    return null;
  }
  return num;
}

function parseOptionalFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return num;
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body = await request.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return new ChatSDKError(
      "bad_request:api",
      "Client name is required"
    ).toResponse();
  }

  try {
    const client = await createClientRecord({
      therapistId: session.user.id,
      name: body.name.trim(),
      background: body.background || null,
      therapeuticModalities: Array.isArray(body.therapeuticModalities)
        ? body.therapeuticModalities.filter(
            (m: unknown) => typeof m === "string" && m.trim()
          )
        : [],
      presentingIssues: body.presentingIssues || null,
      treatmentGoals: body.treatmentGoals || null,
      riskConsiderations: body.riskConsiderations || null,
      status: validateEnum(body.status, CLIENT_STATUSES, "status") ?? "active",
      sessionFrequency: validateEnum(
        body.sessionFrequency,
        SESSION_FREQUENCIES,
        "session frequency"
      ),
      deliveryMethod: validateEnum(
        body.deliveryMethod,
        DELIVERY_METHODS,
        "delivery method"
      ),
      therapyStartDate: body.therapyStartDate || null,
      referralSource: body.referralSource || null,
      ageBracket: validateEnum(body.ageBracket, AGE_BRACKETS, "age bracket"),
      sessionDurationMinutes: parseOptionalInt(body.sessionDurationMinutes),
      contractedSessions: parseOptionalInt(body.contractedSessions),
      feePerSession: parseOptionalFloat(body.feePerSession),
      supervisorNotes: body.supervisorNotes || null,
    });

    return Response.json(client, { status: 201 });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    throw error;
  }
}
