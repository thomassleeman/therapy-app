import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createClientRecord, getClientsByUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const clients = await getClientsByUserId({ userId: session.user.id });

  return Response.json(clients);
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

  const client = await createClientRecord({
    therapistId: session.user.id,
    name: body.name.trim(),
    background: body.background ?? null,
  });

  return Response.json(client, { status: 201 });
}
