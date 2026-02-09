import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getChatCountsByClient, getChatsByClientId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  // If clientId is provided, return chats for that client
  // clientId=null means "General" (no client assigned)
  if (clientId !== null) {
    const resolvedClientId = clientId === "general" ? null : clientId;
    const chats = await getChatsByClientId({
      clientId: resolvedClientId,
      userId: session.user.id,
    });
    return Response.json({ chats });
  }

  // Otherwise return counts per client
  const counts = await getChatCountsByClient({ userId: session.user.id });
  return Response.json({ counts });
}
