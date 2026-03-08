import { auth } from "@/lib/auth";
import { getRecentSessionsForSidebar } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const sessions = await getRecentSessionsForSidebar({
    therapistId: session.user.id,
    limit: 3,
  });

  return Response.json(sessions);
}
