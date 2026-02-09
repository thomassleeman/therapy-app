import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createTag, deleteTag, getTagsByTherapistId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const tags = await getTagsByTherapistId({ therapistId: session.user.id });

  return Response.json(tags);
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
      "Tag name is required"
    ).toResponse();
  }

  try {
    const tag = await createTag({
      therapistId: session.user.id,
      name: body.name.trim(),
    });

    return Response.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError(
      "bad_request:api",
      "Tag ID is required"
    ).toResponse();
  }

  try {
    await deleteTag({ id });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    throw error;
  }
}
