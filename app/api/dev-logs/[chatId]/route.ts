import { auth } from "@/lib/auth";
import { getChatById } from "@/lib/db/queries";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  if (process.env.RAG_LOGGING !== "supabase") {
    return Response.json(
      { error: "RAG logging is not enabled" },
      { status: 404 },
    );
  }

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await params;

  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from("rag_quality_logs")
    .select("turn_data, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[dev-logs] Failed to fetch logs:", error);
    return Response.json({ error: "Failed to fetch logs" }, { status: 500 });
  }

  const entries = (logs ?? []).map((row) => row.turn_data);
  const filename = `rag-logs_${chatId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(entries, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
