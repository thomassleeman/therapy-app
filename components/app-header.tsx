"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@/components/icons";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function AppHeader() {
  const router = useRouter();
  const { open } = useSidebar();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <SidebarToggle />

      {!open && (
        <Button
          className="ml-auto h-8 px-2 md:ml-0 md:h-fit md:px-2"
          onClick={() => {
            router.push("/chat/new");
            router.refresh();
          }}
          variant="outline"
        >
          <PlusIcon />
          <span className="md:sr-only">New Chat</span>
        </Button>
      )}
    </header>
  );
}
