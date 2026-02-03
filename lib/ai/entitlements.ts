import type { UserType } from "@/lib/auth";

type Entitlements = {
  maxMessagesPerDay: number;
};

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account (no longer supported - kept for backwards compatibility)
   */
  guest: {
    maxMessagesPerDay: 0,
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 50,
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
