"use client";

export function RagLogDownloadButton({ chatId }: { chatId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.open(`/api/dev-logs/${chatId}`, "_blank");
      }}
      className="text-xs text-muted-foreground hover:text-foreground underline"
      title="Download RAG quality logs for this chat"
    >
      Download RAG Logs
    </button>
  );
}
