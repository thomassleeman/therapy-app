import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { auth } from "@/lib/auth";
import { getTherapistProfile } from "@/lib/db/queries";

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const profile = await getTherapistProfile({ userId: session.user.id });

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">
        Professional Profile
      </h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        These settings help the AI tailor its responses to your practice.
      </p>
      <ProfileSettingsForm existingProfile={profile} />
    </div>
  );
}
