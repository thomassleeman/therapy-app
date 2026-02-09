import { Suspense } from "react";
import { NavBar } from "@/components/nav-bar";
import { auth } from "@/lib/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <DashboardWrapper>{children}</DashboardWrapper>
    </Suspense>
  );
}

async function DashboardWrapper({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex h-dvh flex-col">
      {session?.user && <NavBar user={session.user} />}
      {children}
    </div>
  );
}
