import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTherapistProfile } from "@/lib/db/queries";
import { ProfileForm } from "./profile-form";

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const profile = await getTherapistProfile({ userId: session.user.id });

  return <ProfileForm profile={profile} />;
}
