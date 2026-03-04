import { redirect } from "next/navigation";
import { DashboardPage } from "@/components/dashboard-page";
import { auth } from "@/lib/auth";
import {
  getChatCountsByClient,
  getChatsByUserId,
  getClientsByUserId,
  getRecentDocumentsByUserId,
} from "@/lib/db/queries";

export default async function Page() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const userId = session.user.id;

  const [chatsResult, documents, clients, chatCounts] = await Promise.all([
    getChatsByUserId({
      id: userId,
      limit: 5,
      startingAfter: null,
      endingBefore: null,
    }),
    getRecentDocumentsByUserId({ userId, limit: 5 }),
    getClientsByUserId({ userId }),
    getChatCountsByClient({ userId }),
  ]);

  return (
    <DashboardPage
      chatCounts={chatCounts}
      clients={clients}
      documents={documents}
      recentChats={chatsResult.chats}
    />
  );
}
