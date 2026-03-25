export default function SessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="flex min-h-0 flex-1 flex-col">{children}</main>;
}
