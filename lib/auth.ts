import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export type UserType = "guest" | "regular";

// Extended user type that includes both Supabase User and our custom type
export interface ExtendedUser extends User {
  type: UserType;
}

export interface Session {
  user: ExtendedUser;
}

/**
 * Get the current user session from Supabase
 * This replaces the NextAuth auth() function
 */
export async function auth(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    user: {
      ...user,
      type: getUserType(user),
    },
  };
}

/**
 * Determine the user type based on Supabase user data
 *
 * For now, all authenticated users are "regular"
 * Future: check user.user_metadata.subscription_tier or app_metadata
 * Example: if (user.user_metadata?.is_premium) return "premium";
 */
function getUserType(_user: User): UserType {
  return "regular";
}
