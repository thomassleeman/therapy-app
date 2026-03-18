"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { saveProfileAction } from "@/app/(app)/settings/actions";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TherapistProfile } from "@/lib/db/types";

const MODALITIES = [
  { value: "integrative", label: "Integrative / Pluralistic" },
  { value: "cbt", label: "Cognitive Behavioural Therapy (CBT)" },
  { value: "person_centred", label: "Person-Centred" },
  { value: "psychodynamic", label: "Psychodynamic" },
  { value: "mct", label: "Metacognitive Therapy (MCT)" },
  { value: "act", label: "Acceptance and Commitment Therapy (ACT)" },
] as const;

const UK_BODIES = ["BACP", "UKCP", "HCPC", "BPS", "NCPS"] as const;
const EU_BODIES = ["IACP", "CORU", "ICP"] as const;

interface ProfileSettingsFormProps {
  existingProfile: TherapistProfile | null;
}

export function ProfileSettingsForm({
  existingProfile,
}: ProfileSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [jurisdiction, setJurisdiction] = useState<"UK" | "EU" | "">(
    existingProfile?.jurisdiction ?? ""
  );
  const [modality, setModality] = useState<string>(
    existingProfile?.defaultModality ?? "integrative"
  );
  const [professionalBody, setProfessionalBody] = useState<string>(
    existingProfile?.professionalBody ?? ""
  );
  const [jurisdictionError, setJurisdictionError] = useState(false);

  const isOtherBody =
    existingProfile?.professionalBody != null &&
    ![...UK_BODIES, ...EU_BODIES].includes(
      existingProfile.professionalBody as (typeof UK_BODIES)[number]
    );

  const [showOtherInput, setShowOtherInput] = useState(isOtherBody);
  const [otherBody, setOtherBody] = useState(
    isOtherBody ? (existingProfile?.professionalBody ?? "") : ""
  );

  function handleProfessionalBodyChange(value: string) {
    if (value === "other") {
      setShowOtherInput(true);
      setProfessionalBody(otherBody || "");
    } else if (value === "none") {
      setShowOtherInput(false);
      setProfessionalBody("");
      setOtherBody("");
    } else {
      setShowOtherInput(false);
      setProfessionalBody(value);
      setOtherBody("");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!jurisdiction) {
      setJurisdictionError(true);
      return;
    }

    setJurisdictionError(false);
    const finalBody = showOtherInput ? otherBody.trim() : professionalBody;

    startTransition(async () => {
      try {
        await saveProfileAction({
          jurisdiction,
          defaultModality: modality === "integrative" ? null : modality,
          professionalBody: finalBody || null,
        });
        toast({ type: "success", description: "Profile saved." });
      } catch {
        toast({
          type: "error",
          description: "Failed to save profile. Please try again.",
        });
      }
    });
  }

  const selectValue = showOtherInput ? "other" : professionalBody || "none";

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-8 pt-6">
          {/* Jurisdiction */}
          <div className="space-y-3">
            <Label>
              Jurisdiction <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              onValueChange={(v) => {
                setJurisdiction(v as "UK" | "EU");
                setJurisdictionError(false);
              }}
              value={jurisdiction}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="jurisdiction-uk" value="UK" />
                <Label className="font-normal" htmlFor="jurisdiction-uk">
                  United Kingdom
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="jurisdiction-eu" value="EU" />
                <Label className="font-normal" htmlFor="jurisdiction-eu">
                  European Union
                </Label>
              </div>
            </RadioGroup>
            {jurisdictionError && (
              <p className="text-sm text-destructive">
                Please select a jurisdiction.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Determines which legislation and professional guidelines are
              surfaced. UK covers England, Wales, Scotland, and Northern
              Ireland. EU currently covers the Republic of Ireland.
            </p>
          </div>

          {/* Default Therapeutic Approach */}
          <div className="space-y-3">
            <Label>Default Therapeutic Approach</Label>
            <RadioGroup onValueChange={setModality} value={modality}>
              {MODALITIES.map((m) => (
                <div className="flex items-center space-x-2" key={m.value}>
                  <RadioGroupItem id={`modality-${m.value}`} value={m.value} />
                  <Label
                    className="font-normal"
                    htmlFor={`modality-${m.value}`}
                  >
                    {m.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-sm text-muted-foreground">
              Your primary therapeutic framework. This filters knowledge base
              searches to your approach by default. Choose
              &lsquo;Integrative&rsquo; if you draw from multiple frameworks
              &mdash; you&rsquo;ll see content from all modalities. You can
              override this per client or per conversation.
            </p>
          </div>

          {/* Professional Body */}
          <div className="space-y-3">
            <Label>Professional Body</Label>
            <Select
              onValueChange={handleProfessionalBodyChange}
              value={selectValue}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a professional body" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None selected</SelectItem>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>United Kingdom</SelectLabel>
                  {UK_BODIES.map((body) => (
                    <SelectItem key={body} value={body}>
                      {body}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Ireland / EU</SelectLabel>
                  {EU_BODIES.map((body) => (
                    <SelectItem key={body} value={body}>
                      {body}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {showOtherInput && (
              <Input
                onChange={(e) => {
                  setOtherBody(e.target.value);
                  setProfessionalBody(e.target.value.trim());
                }}
                placeholder="Enter your professional body"
                value={otherBody}
              />
            )}
            <p className="text-sm text-muted-foreground">
              Your primary professional body. This will help prioritise relevant
              ethical guidelines in future.
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button disabled={isPending} type="submit">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
