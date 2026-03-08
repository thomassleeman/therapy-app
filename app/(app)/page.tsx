import { redirect } from "next/navigation";
import { DashboardPage } from "@/components/dashboard-page";
import { auth } from "@/lib/auth";
import {
  getChatCountsByClient,
  getChatsByUserId,
  getClientsByUserId,
  getRecentSessions,
  getSessionCountsByClient,
} from "@/lib/db/queries";

export default async function Page() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const userId = session.user.id;

  const [chatsResult, recentSessions, clients, chatCounts, sessionCounts] =
    await Promise.all([
      getChatsByUserId({
        id: userId,
        limit: 5,
        startingAfter: null,
        endingBefore: null,
      }),
      getRecentSessions({ therapistId: userId, limit: 5 }),
      getClientsByUserId({ userId }),
      getChatCountsByClient({ userId }),
      getSessionCountsByClient({ therapistId: userId }),
    ]);

  return (
    <DashboardPage
      chatCounts={chatCounts}
      clients={clients}
      recentChats={chatsResult.chats}
      recentSessions={recentSessions}
      sessionCounts={sessionCounts}
    />
  );
}
