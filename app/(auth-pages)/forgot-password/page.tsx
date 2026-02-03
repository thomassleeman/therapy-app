import { forgotPasswordAction } from "@/app/actions";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { FormMessage, Message } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Suspense } from "react";
// import { SmtpMessage } from "../smtp-message";

async function ForgotPasswordMessage(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;
  return <FormMessage message={searchParams} />;
}

export default function ForgotPassword(props: {
  searchParams: Promise<Message>;
}) {
  return (
    <>
      <form className="flex-1 flex flex-col w-full gap-2 text-foreground [&>input]:mb-6 min-w-64 max-w-64 mx-auto">
        <div>
          <h1 className="text-2xl font-medium">Reset Password</h1>
          <p className="text-sm text-secondary-foreground">
            Already have an account?{" "}
            <Link className="text-primary underline" href="/sign-in">
              Sign in
            </Link>
          </p>
        </div>
        <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
          <Label htmlFor="email">Email</Label>
          <Input name="email" placeholder="you@example.com" required />
          <AuthSubmitButton formAction={forgotPasswordAction}>
            Reset Password
          </AuthSubmitButton>
          <Suspense fallback={<div className="h-6" />}>
            <ForgotPasswordMessage searchParams={props.searchParams} />
          </Suspense>
        </div>
      </form>
      {/* <SmtpMessage /> */}
    </>
  );
}
