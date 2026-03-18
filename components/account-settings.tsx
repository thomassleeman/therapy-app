"use client";

import { Clock, Loader2, Mail, Shield } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/actions/account";

interface AccountSettingsProps {
  email: string;
  provider: "email" | "google";
  userId: string;
  createdAt: string;
}

function formatMemberSince(dateString: string): string {
  if (!dateString) {
    return "Unknown";
  }
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function AccountSettings({
  email,
  provider,
  createdAt,
}: AccountSettingsProps) {
  return (
    <div className="space-y-6">
      <AccountInfoCard
        createdAt={createdAt}
        email={email}
        provider={provider}
      />
      <ChangePasswordCard provider={provider} />
      <ActiveSessionsCard />
    </div>
  );
}

function AccountInfoCard({
  email,
  provider,
  createdAt,
}: {
  email: string;
  provider: "email" | "google";
  createdAt: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Account Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Authentication method</p>
            <p className="text-sm text-muted-foreground">
              {provider === "google" ? "Google" : "Email & Password"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Member since</p>
            <p className="text-sm text-muted-foreground">
              {formatMemberSince(createdAt)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard({ provider }: { provider: "email" | "google" }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError("");

    if (newPassword.length < 8) {
      setValidationError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError("New password and confirmation do not match.");
      return;
    }

    startTransition(async () => {
      const result = await changePassword({ currentPassword, newPassword });
      if (result.success) {
        toast({
          type: "success",
          description: "Password changed successfully.",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast({
          type: "error",
          description: result.error ?? "Failed to change password.",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Change Password</CardTitle>
      </CardHeader>
      <CardContent>
        {provider === "google" ? (
          <p className="text-sm text-muted-foreground">
            Your account uses Google sign-in. Manage your password through your
            Google account.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                onChange={(e) => setNewPassword(e.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </div>
            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
            <Button disabled={isPending} type="submit">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveSessionsCard() {
  return (
    <Card className="opacity-60">
      <CardHeader>
        <CardTitle className="text-lg">Active Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Session management is coming soon. You&apos;ll be able to view and
          revoke active sessions across devices.
        </p>
      </CardContent>
    </Card>
  );
}
