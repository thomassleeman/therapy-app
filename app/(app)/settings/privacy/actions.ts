"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { deleteAllChatsByUserId } from "@/lib/db/queries";
import { createClient } from "@/utils/supabase/server";

export async function exportDataAction(): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  const { exportUserData } = await import("@/lib/actions/data-export");
  return exportUserData();
}

export async function requestAccountDeletionAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Not authenticated." };
  }

  const supabase = await createClient();
  const userId = session.user.id;
  const userEmail = session.user.email;

  // Check for existing pending/processing request
  const { data: existing, error: checkError } = await supabase
    .from("account_deletion_requests")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "processing"])
    .limit(1)
    .maybeSingle();

  if (checkError) {
    return { success: false, error: "Failed to check existing requests." };
  }

  if (existing) {
    return {
      success: false,
      error: "A deletion request is already in progress.",
    };
  }

  // Insert deletion request
  const { error: insertError } = await supabase
    .from("account_deletion_requests")
    .insert({
      user_id: userId,
      user_email: userEmail,
      status: "pending",
      execute_after: new Date().toISOString(),
      audit_log: [{ action: "requested", timestamp: new Date().toISOString() }],
    });

  if (insertError) {
    return { success: false, error: "Failed to submit deletion request." };
  }

  // Sign user out
  await supabase.auth.signOut();

  return { success: true };
}

export async function deleteAllChatsAction(
  userId: string
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.id !== userId) {
    return { success: false, error: "Not authenticated." };
  }

  try {
    const result = await deleteAllChatsByUserId({ userId });
    revalidatePath("/settings/privacy");
    revalidatePath("/chat");
    return { success: true, deletedCount: result.deletedCount };
  } catch {
    return { success: false, error: "Failed to delete chats." };
  }
}
