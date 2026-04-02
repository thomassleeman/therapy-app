import { SessionsPage } from "@/components/sessions-page";

export default function Page() {
  return (
    <div className="min-h-0 w-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <SessionsPage />
      </div>
    </div>
  );
}
