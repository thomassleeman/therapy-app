import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/account-settings";
import { auth } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const provider =
    user?.app_metadata?.provider === "google" ? "google" : "email";

  const createdAt = user?.created_at ?? session.user.created_at ?? "";

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">
        Account & Security
      </h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Manage your account details and security settings.
      </p>
      <AccountSettings
        createdAt={createdAt}
        email={session.user.email ?? ""}
        provider={provider}
        userId={session.user.id}
      />
    </div>
  );
}
