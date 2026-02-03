import { CheckCircle } from "lucide-react";

export default function CheckEmails() {
  return (
    <div className="flex mx-auto items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-green-100 p-3">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        {/* Heading */}
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-muted-foreground mb-8">
          We&apos;ve sent a confirmation link to your email address. Please
          click the link to verify your account and complete the sign-up
          process.
        </p>
      </div>
    </div>
  );
}
