import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import {
  createTag,
  deleteClientById,
  getClientById,
  getTagsByTherapistId,
  setClientTags,
  updateClientById,
} from "@/lib/db/queries";
import {
  AGE_BRACKETS,
  CLIENT_STATUSES,
  DELIVERY_METHODS,
  SESSION_FREQUENCIES,
} from "@/lib/db/types";
import { ChatSDKError } from "@/lib/errors";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { id } = await params;
  const client = await getClientById({ id });

  if (!client) {
    return new ChatSDKError(
      "not_found:database",
      "Client not found"
    ).toResponse();
  }

  // Verify ownership
  if (client.therapistId !== session.user.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  return Response.json(client);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { id } = await params;
  const existingClient = await getClientById({ id });

  if (!existingClient) {
    return new ChatSDKError(
      "not_found:database",
      "Client not found"
    ).toResponse();
  }

  // Verify ownership
  if (existingClient.therapistId !== session.user.id) {
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
    const client = await updateClientById({
      id,
      name: body.name.trim(),
      background: body.background ?? null,
      therapeuticModalities: Array.isArray(body.therapeuticModalities)
        ? body.therapeuticModalities.filter(
            (m: unknown) => typeof m === "string" && m.trim()
          )
        : undefined,
      presentingIssues: body.presentingIssues ?? null,
      treatmentGoals: body.treatmentGoals ?? null,
      riskConsiderations: body.riskConsiderations ?? null,
      status: validateEnum(body.status, CLIENT_STATUSES, "status") ?? undefined,
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
      therapyStartDate: body.therapyStartDate ?? null,
      referralSource: body.referralSource ?? null,
      ageBracket: validateEnum(body.ageBracket, AGE_BRACKETS, "age bracket"),
      sessionDurationMinutes: parseOptionalInt(body.sessionDurationMinutes),
      contractedSessions: parseOptionalInt(body.contractedSessions),
      feePerSession: parseOptionalFloat(body.feePerSession),
      supervisorNotes: body.supervisorNotes ?? null,
    });

    // Handle tags if provided
    if (Array.isArray(body.tags)) {
      const tagNames: string[] = body.tags.filter(
        (t: unknown) => typeof t === "string" && t.trim()
      );

      // Resolve tag names to IDs, creating any that don't exist
      const existingTags = await getTagsByTherapistId({
        therapistId: session.user.id,
      });
      const existingTagMap = new Map(existingTags.map((t) => [t.name, t.id]));

      const tagIds: string[] = [];
      for (const name of tagNames) {
        const trimmed = name.trim();
        let tagId = existingTagMap.get(trimmed);
        if (!tagId) {
          const newTag = await createTag({
            therapistId: session.user.id,
            name: trimmed,
          });
          tagId = newTag.id;
        }
        tagIds.push(tagId);
      }

      await setClientTags({ clientId: id, tagIds });
      client.tags = tagNames.map((t) => t.trim());
    }

    return Response.json(client);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { id } = await params;
  const existingClient = await getClientById({ id });

  if (!existingClient) {
    return new ChatSDKError(
      "not_found:database",
      "Client not found"
    ).toResponse();
  }

  // Verify ownership
  if (existingClient.therapistId !== session.user.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  await deleteClientById({ id });

  return new Response(null, { status: 204 });
}
