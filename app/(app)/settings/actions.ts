"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { upsertTherapistProfile } from "@/lib/db/queries";
import type { TherapistProfileInsert } from "@/lib/db/types";

export async function saveProfileAction(
  data: Omit<TherapistProfileInsert, "id">
) {
  const session = await auth();
  if (!session) {
    throw new Error("Unauthorized");
  }

  await upsertTherapistProfile({
    id: session.user.id,
    ...data,
  });

  revalidatePath("/settings/profile");
}
