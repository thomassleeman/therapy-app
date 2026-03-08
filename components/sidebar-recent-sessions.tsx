"use client";

import Link from "next/link";
import useSWR from "swr";
import type { User } from "@supabase/supabase-js";
import type { SidebarSession } from "@/lib/db/types";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatClientName(name: string | null): string {
  if (!name) return "Unknown";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function SidebarRecentSessions({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { data: sessions } = useSWR<SidebarSession[]>(
    user ? "/api/recent-sessions" : null,
    fetcher,
  );

  if (!user || !sessions || sessions.length === 0) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent Sessions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {sessions.map((session) => (
            <SidebarMenuItem key={session.id}>
              <SidebarMenuButton asChild>
                <Link
                  href={`/sessions/${session.id}`}
                  onClick={() => setOpenMobile(false)}
                >
                  <span className="truncate">{formatClientName(session.clientName)}</span>
                  <span className="ml-auto text-xs text-sidebar-foreground/50">
                    {formatDate(session.sessionDate)}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
