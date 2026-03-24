import { toast } from "@/components/toast";

const NETWORK_ERROR_MESSAGE =
  "Unable to connect. Please check your internet connection and try again.";

const SERVER_UNREACHABLE_MESSAGE =
  "Having trouble reaching the server. Please check your connection or try again shortly.";

function isNetworkError(error: unknown): boolean {
  // Browser reports offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  // fetch() itself threw — almost always a network failure
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return true;
  }
  return false;
}

export async function extractErrorMessage(
  res: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Response body wasn't JSON — likely an intermediary returned HTML
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return NETWORK_ERROR_MESSAGE;
    }
    return SERVER_UNREACHABLE_MESSAGE;
  }
  return fallbackMessage;
}

export function showErrorToast(error: unknown, fallbackMessage: string): void {
  if (error instanceof Error) {
    console.error(error);
  }

  if (isNetworkError(error)) {
    toast({ type: "error", description: NETWORK_ERROR_MESSAGE });
    return;
  }

  // If the error carries one of our own connectivity messages, prefer it
  // over the caller's generic fallback
  if (
    error instanceof Error &&
    (error.message === NETWORK_ERROR_MESSAGE ||
      error.message === SERVER_UNREACHABLE_MESSAGE)
  ) {
    toast({ type: "error", description: error.message });
    return;
  }

  toast({ type: "error", description: fallbackMessage });
}

export function showSuccessToast(message: string): void {
  toast({ type: "success", description: message });
}
