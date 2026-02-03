import { signUpAction } from "@/app/actions";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { FormMessage, Message } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Suspense } from "react";
// import { SmtpMessage } from "../smtp-message";

async function SignupMessage(props: {
  searchParams: Promise<Message & { plan?: string }>;
}) {
  const searchParams = await props.searchParams;
  const plan = searchParams.plan;

  return (
    <>
      {plan && <input type="hidden" name="plan" value={plan} />}
      <FormMessage message={searchParams} />
      {"error" in searchParams && searchParams.error?.includes("already exists") && (
        <div className="flex flex-col gap-2 mt-2 text-sm">
          <Link
            href="/sign-in"
            className="text-primary font-medium underline text-center"
          >
            Go to sign in
          </Link>
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline text-center"
          >
            Forgot password?
          </Link>
        </div>
      )}
    </>
  );
}

export default function Signup(props: {
  searchParams: Promise<Message & { plan?: string }>;
}) {
  return (
    <>
      <form className="flex flex-col min-w-64 max-w-64 mx-auto">
        <h1 className="text-2xl font-medium">Sign up</h1>
        <p className="text-sm text text-foreground">
          Already have an account?{" "}
          <Link className="text-primary font-medium underline" href="/sign-in">
            Sign in
          </Link>
        </p>
        <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
          <Label htmlFor="email">Email</Label>
          <Input name="email" placeholder="you@example.com" required />
          <Label htmlFor="password">Password</Label>
          <Input
            type="password"
            name="password"
            placeholder="Your password"
            minLength={6}
            required
          />
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            type="password"
            name="confirmPassword"
            placeholder="Confirm your password"
            minLength={6}
            required
          />
          <AuthSubmitButton formAction={signUpAction} pendingText="Signing up...">
            Sign up
          </AuthSubmitButton>
          <Suspense fallback={<div className="h-6" />}>
            <SignupMessage searchParams={props.searchParams} />
          </Suspense>
        </div>
      </form>
      {/* <SmtpMessage /> */}
    </>
  );
}
