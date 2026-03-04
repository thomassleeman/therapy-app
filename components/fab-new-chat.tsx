import Link from "next/link";
import { PlusIcon } from "@/components/icons";

interface FabNewChatProps {
  clientId?: string;
}

export function FabNewChat({ clientId }: FabNewChatProps) {
  const href = clientId ? `/chat/new?clientId=${clientId}` : "/chat/new";

  return (
    <div className="fixed bottom-6 right-6 z-50 md:hidden">
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-900 px-3 py-1 text-xs text-white dark:bg-gray-700">
        New Chat
      </span>
      <Link
        className="flex size-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700"
        href={href}
      >
        <PlusIcon size={24} />
      </Link>
    </div>
  );
}
