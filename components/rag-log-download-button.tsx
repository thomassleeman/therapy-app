"use client";

export function RagLogDownloadButton({ chatId }: { chatId: string }) {
  return (
    <button
      className="text-xs text-muted-foreground hover:text-foreground underline"
      onClick={() => {
        window.open(`/api/dev-logs/${chatId}`, "_blank");
      }}
      title="Download RAG quality logs for this chat"
      type="button"
    >
      Download RAG Logs
    </button>
  );
}
