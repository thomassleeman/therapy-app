"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { saveProfileAction } from "../actions";

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

interface ProfileFormProps {
  profile: TherapistProfile | null;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const [jurisdiction, setJurisdiction] = useState<"UK" | "EU" | "">(
    profile?.jurisdiction ?? ""
  );
  const [modality, setModality] = useState<string>(
    profile?.defaultModality ?? "integrative"
  );
  const [professionalBody, setProfessionalBody] = useState<string>(
    profile?.professionalBody ?? ""
  );
  const [showOtherInput, setShowOtherInput] = useState(
    profile?.professionalBody
      ? ![...UK_BODIES, ...EU_BODIES].includes(
          profile.professionalBody as (typeof UK_BODIES)[number]
        )
      : false
  );
  const [otherBody, setOtherBody] = useState(
    profile?.professionalBody &&
      ![...UK_BODIES, ...EU_BODIES].includes(
        profile.professionalBody as (typeof UK_BODIES)[number]
      )
      ? profile.professionalBody
      : ""
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
      toast({ type: "error", description: "Please select a jurisdiction." });
      return;
    }

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
        <CardHeader>
          <CardTitle>Professional Profile</CardTitle>
          <CardDescription>
            These settings help the AI tailor its responses to your practice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Jurisdiction */}
          <div className="space-y-3">
            <Label>
              Jurisdiction <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              onValueChange={(v) => setJurisdiction(v as "UK" | "EU")}
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
            <p className="text-sm text-muted-foreground">
              Determines which legislation and professional guidelines are
              surfaced. UK covers England, Wales, Scotland, and Northern
              Ireland. EU currently covers the Republic of Ireland.
            </p>
          </div>

          {/* Default Modality */}
          <div className="space-y-3">
            <Label>Default therapeutic approach</Label>
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
              always override this per client or per conversation.
            </p>
          </div>

          {/* Professional Body */}
          <div className="space-y-3">
            <Label>Professional body</Label>
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
                  <SelectLabel>UK</SelectLabel>
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
              Your primary professional body. This helps prioritise relevant
              ethical guidelines.
            </p>
          </div>

          {/* Submit */}
          <Button disabled={isPending} type="submit">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
