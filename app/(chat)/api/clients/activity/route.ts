import { auth } from "@/lib/auth";
import {
  getLastActivityByClient,
  getSessionCountsByClient,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const [sessionCounts, lastActivity] = await Promise.all([
    getSessionCountsByClient({ therapistId: session.user.id }),
    getLastActivityByClient({ therapistId: session.user.id }),
  ]);

  // Serialize Date objects to ISO strings for JSON transport
  const lastActivitySerialized: Record<string, string> = {};
  for (const [clientId, date] of Object.entries(lastActivity)) {
    lastActivitySerialized[clientId] = date.toISOString();
  }

  return Response.json({
    sessionCounts,
    lastActivity: lastActivitySerialized,
  });
}
