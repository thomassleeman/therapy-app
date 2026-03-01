import "server-only";

import type {
  FaithfulnessClaimResult,
  FaithfulnessResult,
} from "@/lib/ai/faithfulness-check";
import { createClient } from "@/utils/supabase/server";

export async function saveFaithfulnessCheck(params: {
  chatId: string;
  messageId: string;
  result: FaithfulnessResult;
}): Promise<void> {
  const { chatId, messageId, result } = params;
  const supabase = await createClient();

  const { error } = await supabase.from("faithfulness_checks").insert({
    chat_id: chatId,
    message_id: messageId,
    overall_score: result.overallScore,
    flagged: result.flagged,
    claims: result.claims,
    evaluation_latency_ms: result.evaluationLatencyMs,
  });

  if (error) {
    console.error("[faithfulness] Failed to save check:", error);
  }
}

export async function getFlaggedResponses(options?: {
  limit?: number;
  since?: Date;
}): Promise<
  Array<{
    id: string;
    chatId: string;
    messageId: string;
    overallScore: number;
    claims: FaithfulnessClaimResult[];
    createdAt: string;
  }>
> {
  const supabase = await createClient();

  let query = supabase
    .from("faithfulness_checks")
    .select("id, chat_id, message_id, overall_score, claims, created_at")
    .eq("flagged", true)
    .order("created_at", { ascending: false });

  if (options?.since) {
    query = query.gte("created_at", options.since.toISOString());
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[faithfulness] Failed to fetch flagged responses:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    messageId: row.message_id,
    overallScore: Number(row.overall_score),
    claims: row.claims as FaithfulnessClaimResult[],
    createdAt: row.created_at,
  }));
}
