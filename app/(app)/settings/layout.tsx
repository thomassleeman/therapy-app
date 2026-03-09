export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}
