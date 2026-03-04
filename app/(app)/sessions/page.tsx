import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { getTherapySessions } from "@/lib/db/queries";
import { SessionsTable } from "./sessions-table";

export default async function SessionsPage() {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }

  const sessions = await getTherapySessions({
    therapistId: session.user.id,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record, transcribe, and manage your therapy sessions.
          </p>
        </div>
        <Button asChild className="min-h-11" size="lg">
          <Link href="/sessions/new">
            <Plus className="size-4" />
            New Session
          </Link>
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 px-4 text-center">
          <p className="text-muted-foreground">
            No sessions yet. Record or upload your first session to get started.
          </p>
          <Button asChild className="mt-4 min-h-11" variant="outline">
            <Link href="/sessions/new">
              <Plus className="size-4" />
              Start Your First Session
            </Link>
          </Button>
        </div>
      ) : (
        <SessionsTable sessions={sessions} />
      )}
    </div>
  );
}
