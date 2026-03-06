import type { ReactNode } from "react";

interface ListPageEmptyProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function ListPageEmpty({
  icon,
  title,
  description,
  action,
}: ListPageEmptyProps) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      {icon}
      <h3 className="mt-2 font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
