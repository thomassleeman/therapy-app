"use server";

import { createClient as createBrowserClient } from "@supabase/supabase-js";

import { auth } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "";

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Not authenticated." };
  }

  const email = session.user.email;
  if (!email) {
    return { success: false, error: "No email associated with this account." };
  }

  // Use a standalone (non-cookie) client to verify the current password
  // so we don't overwrite the session cookies on the cookie-based SSR client.
  const verifyClient = createBrowserClient(supabaseUrl, supabaseKey);
  const { error: signInError } = await verifyClient.auth.signInWithPassword({
    email,
    password: input.currentPassword,
  });

  if (signInError) {
    return { success: false, error: "Current password is incorrect." };
  }

  // Use the cookie-based client (which has the active session) to update the password
  const supabase = await createClient();
  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    return {
      success: false,
      error: "Failed to update password. Please try again.",
    };
  }

  return { success: true };
}
