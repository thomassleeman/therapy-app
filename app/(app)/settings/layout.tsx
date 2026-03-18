import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <h1 className="text-2xl font-semibold tracking-tight mb-6">Settings</h1>

        {/* Mobile nav */}
        <div className="md:hidden mb-6">
          <SettingsNav />
        </div>

        {/* Desktop: side-by-side layout */}
        <div className="flex gap-8">
          {/* Desktop nav */}
          <div className="hidden md:block">
            <SettingsNav />
          </div>

          {/* Content area */}
          <div className="min-w-0 flex-1 max-w-2xl">{children}</div>
        </div>
      </div>
    </main>
  );
}
