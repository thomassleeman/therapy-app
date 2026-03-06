interface ListPageSkeletonProps {
  rows?: number;
}

export function ListPageSkeleton({ rows = 4 }: ListPageSkeletonProps) {
  return (
    <div className="mt-4 space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div className="flex items-center gap-4 py-4" key={i}>
          <div className="size-8 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
