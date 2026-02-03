export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-24 max-w-5xl flex flex-col gap-12 items-start p-5">
      {children}
    </div>
  );
}
