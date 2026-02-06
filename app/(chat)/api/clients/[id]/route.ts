import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteClientById,
  getClientById,
  updateClientById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

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

  const client = await updateClientById({
    id,
    name: body.name.trim(),
    background: body.background ?? null,
  });

  return Response.json(client);
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
