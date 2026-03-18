import { redirect } from "next/navigation";

import { DataPrivacySettings } from "@/components/data-privacy-settings";
import { auth } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

export default async function PrivacySettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("Chat")
    .select("*", { count: "exact", head: true })
    .eq("userId", session.user.id);

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">Data & Privacy</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Understand how your data is handled, exercise your rights, and manage
        your data.
      </p>
      <DataPrivacySettings chatCount={count ?? 0} userId={session.user.id} />
    </div>
  );
}
