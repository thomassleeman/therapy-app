"use client";

import type { ReactNode } from "react";

interface ListPageShellProps {
  title: string;
  count?: number;
  isLoading?: boolean;
  headerAction: ReactNode;
  children: ReactNode;
}

export function ListPageShell({
  title,
  count,
  isLoading,
  headerAction,
  children,
}: ListPageShellProps) {
  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto">
      <header className="flex items-center gap-2 bg-background px-4 py-1.5 sm:px-6 lg:px-8">
        <h1 className="text-lg font-semibold">
          {title}
          {!isLoading && count !== undefined && ` (${count})`}
        </h1>
        <div className="ml-auto">{headerAction}</div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-6 lg:px-8">
        <div className="pt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}
