"use client";

import { Info, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface CaseFormulationNudgeProps {
  clientId: string;
  clientAlias: string;
  hasExistingFormulation: boolean;
  formationLastUpdated: string | null; // ISO date string
  sessionDate: string; // ISO date string of the session whose notes were just finalised
}

export function CaseFormulationNudge({
  clientId,
  clientAlias,
  hasExistingFormulation,
  formationLastUpdated,
  sessionDate,
}: CaseFormulationNudgeProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  // Formulation is up to date — no nudge needed
  if (
    hasExistingFormulation &&
    formationLastUpdated !== null &&
    new Date(formationLastUpdated) >= new Date(sessionDate)
  ) {
    return null;
  }

  const documentUrl = `/clients/${clientId}/documents/new?type=case_formulation`;

  const message =
    hasExistingFormulation && formationLastUpdated !== null
      ? `Your Case Formulation for ${clientAlias} was last updated on ${new Date(formationLastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Would you like to update it with insights from this session?`
      : `You don't have a Case Formulation for ${clientAlias} yet. Creating one helps the AI provide more informed reflections in your chats.`;

  const actionLabel =
    hasExistingFormulation && formationLastUpdated !== null
      ? "Update Case Formulation"
      : "Create Case Formulation";

  return (
    <Alert className="relative mt-4 border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20">
      <Info className="size-4 text-blue-600 dark:text-blue-400" />
      <Button
        aria-label="Dismiss"
        className="absolute right-2 top-2 size-7 text-muted-foreground hover:text-foreground"
        onClick={() => setDismissed(true)}
        size="icon"
        variant="ghost"
      >
        <X className="size-3.5" />
      </Button>
      <AlertTitle className="text-blue-900 dark:text-blue-200 pr-8">
        Case Formulation
      </AlertTitle>
      <AlertDescription className="text-blue-800 dark:text-blue-300">
        <p className="mb-3">{message}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            size="sm"
          >
            <Link href={documentUrl}>{actionLabel}</Link>
          </Button>
          <Button
            className="text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
            onClick={() => setDismissed(true)}
            size="sm"
            variant="ghost"
          >
            Not now
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
