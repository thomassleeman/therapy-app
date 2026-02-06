"use client";

import { useFormStatus } from "react-dom";

import { LoaderIcon } from "@/components/icons";

import { Button } from "./ui/button";

interface AuthSubmitButtonProps {
  children: React.ReactNode;
  pendingText?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}

export function AuthSubmitButton({
  children,
  pendingText,
  formAction,
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-disabled={pending}
      className="relative"
      disabled={pending}
      formAction={formAction}
      type="submit"
    >
      {pending ? (pendingText ?? children) : children}

      {pending && (
        <span className="absolute right-4 animate-spin">
          <LoaderIcon />
        </span>
      )}

      <output aria-live="polite" className="sr-only">
        {pending ? "Loading" : "Submit form"}
      </output>
    </Button>
  );
}
