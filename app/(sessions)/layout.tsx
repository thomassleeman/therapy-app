import { Suspense } from "react";
import { NavBar } from "@/components/nav-bar";
import { auth } from "@/lib/auth";

export default function SessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <SessionsWrapper>{children}</SessionsWrapper>
    </Suspense>
  );
}

async function SessionsWrapper({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex h-dvh flex-col">
      {session?.user && <NavBar user={session.user} />}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
