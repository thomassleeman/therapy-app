import { Suspense } from "react";
import { resetPasswordAction } from "@/app/actions";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { FormMessage, type Message } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function ResetPasswordMessage(props: { searchParams: Promise<Message> }) {
  const searchParams = await props.searchParams;
  return <FormMessage message={searchParams} />;
}

export default function ResetPassword(props: {
  searchParams: Promise<Message>;
}) {
  return (
    <form className="flex flex-col w-full max-w-md p-4 gap-2 [&>input]:mb-4">
      <h1 className="text-2xl font-medium">Reset password</h1>
      <p className="text-sm text-foreground/60">
        Please enter your new password below.
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="password">New password</Label>
        <Input
          minLength={6}
          name="password"
          placeholder="New password"
          required
          type="password"
        />
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          minLength={6}
          name="confirmPassword"
          placeholder="Confirm password"
          required
          type="password"
        />
        <AuthSubmitButton formAction={resetPasswordAction}>
          Reset password
        </AuthSubmitButton>
        <Suspense fallback={<div className="h-6" />}>
          <ResetPasswordMessage searchParams={props.searchParams} />
        </Suspense>
      </div>
    </form>
  );
}
