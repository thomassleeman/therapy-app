import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <FileQuestion className="size-10 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button asChild>
        <a href="/sessions">Go to dashboard</a>
      </Button>
    </div>
  );
}
