"use client";

import type { User } from "@supabase/supabase-js";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSupabaseAuth } from "@/lib/hooks/useSupabaseAuth";
import { createClient } from "@/utils/supabase/client";
import { LoaderIcon } from "./icons";
import { toast } from "./toast";
import Logo from "@/public/images/brainLogoCompressed.png";

export function NavBar({ user }: { user: User }) {
  const router = useRouter();
  const { user: clientUser, loading } = useSupabaseAuth();
  const { setTheme, resolvedTheme } = useTheme();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const displayUser = clientUser || user;

  return (
    <nav className="flex items-center justify-between border-b px-4 py-2">
      <Link className="flex items-center gap-2" href="/">
        <Image
          alt="Therapy Reflection Agent Logo"
          height={28}
          src={Logo}
          width={28}
        />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {loading ? (
            <button
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
              type="button"
            >
              <div className="size-6 animate-pulse rounded-full bg-zinc-500/30" />
              <span className="animate-pulse rounded-md bg-zinc-500/30 text-transparent">
                Loading
              </span>
              <div className="animate-spin text-zinc-500">
                <LoaderIcon />
              </div>
            </button>
          ) : (
            <button
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
              type="button"
            >
              <Image
                alt={displayUser.email ?? "User Avatar"}
                className="rounded-full"
                height={24}
                src={`https://avatar.vercel.sh/${displayUser.email}`}
                width={24}
              />
              <span className="hidden sm:inline">{displayUser.email}</span>
              <ChevronDown className="size-4" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {`Toggle ${resolvedTheme === "light" ? "dark" : "light"} mode`}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <button
              className="w-full cursor-pointer"
              onClick={() => {
                if (loading) {
                  toast({
                    type: "error",
                    description:
                      "Checking authentication status, please try again!",
                  });
                  return;
                }
                handleSignOut();
              }}
              type="button"
            >
              Sign out
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
