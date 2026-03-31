import { redirect } from "next/navigation";

import { NoteFormatsSettings } from "@/components/note-formats-settings";
import { auth } from "@/lib/auth";

export default async function NoteFormatsSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">
        Custom Note Formats
      </h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Create your own note formats. Custom formats appear alongside the
        standard formats when generating session notes. The section descriptions
        you write are given directly to the AI, so be specific about what
        content you want in each section.
      </p>
      <NoteFormatsSettings />
    </div>
  );
}
