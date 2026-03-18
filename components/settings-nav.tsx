"use client";

import { Info, Lock, Shield, UserCog } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Professional Profile",
    href: "/settings/profile",
    icon: UserCog,
    testId: "settings-nav-profile",
  },
  {
    label: "Account & Security",
    href: "/settings/account",
    icon: Shield,
    testId: "settings-nav-account",
  },
  {
    label: "Data & Privacy",
    href: "/settings/privacy",
    icon: Lock,
    testId: "settings-nav-privacy",
  },
  {
    label: "About",
    href: "/settings/about",
    icon: Info,
    testId: "settings-nav-about",
  },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: vertical sidebar nav */}
      <nav className="hidden md:flex w-[200px] shrink-0 flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              data-testid={item.testId}
              href={item.href}
              key={item.href}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: horizontal scrollable tabs */}
      <nav className="flex md:hidden overflow-x-auto gap-1 pb-2 -mx-1 px-1 scrollbar-hide">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors shrink-0",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              data-testid={item.testId}
              href={item.href}
              key={item.href}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
