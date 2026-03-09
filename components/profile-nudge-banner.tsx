"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "profile-nudge-dismissed";

export function ProfileNudgeBanner({ hasProfile }: { hasProfile: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasProfile && !sessionStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, [hasProfile]);

  if (!visible) return null;

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl items-center gap-3 border-b bg-muted/50 px-4 py-2.5 text-sm">
      <span className="flex-1 text-muted-foreground">
        Set up your professional profile to get more personalised results.{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
          href="/settings/profile"
        >
          Go to Settings &rarr;
        </Link>
      </span>
      <button
        aria-label="Dismiss"
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        type="button"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
