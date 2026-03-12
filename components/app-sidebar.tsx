"use client";

import type { User } from "@supabase/supabase-js";
import { Mic } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, PlusIcon, UserIcon } from "@/components/icons";
import { SidebarHistory } from "@/components/sidebar-history";
import { SidebarRecentSessions } from "@/components/sidebar-recent-sessions";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import Logo from "@/public/images/brainLogoCompressed.png";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const navItems = [
    { label: "Dashboard", href: "/", icon: () => <HomeIcon size={16} /> },
    { label: "Clients", href: "/clients", icon: UserIcon },
    { label: "Sessions", href: "/sessions", icon: Mic },
  ];

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            {/* <Link
              className="flex flex-row items-center gap-3"
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
            > */}
            <span className=" rounded-md px-2">
              <Image
                alt="Therapy Reflection Agent Logo"
                height={32}
                src={Logo}
                width={32}
              />
            </span>
            {/* </Link> */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 p-1 md:h-fit md:p-2"
                  onClick={() => {
                    setOpenMobile(false);
                    router.push("/chat/new");
                    router.refresh();
                  }}
                  type="button"
                  variant="ghost"
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end" className="hidden md:block">
                New Chat
              </TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {user && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link
                          href={item.href}
                          onClick={() => setOpenMobile(false)}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <Separator className="mx-auto w-[calc(100%-1rem)]" />
        <SidebarHistory user={user} />
        <Separator className="mx-auto w-[calc(100%-1rem)] border-dashed" />
        <SidebarRecentSessions user={user} />
      </SidebarContent>
      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
