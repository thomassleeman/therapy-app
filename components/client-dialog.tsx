"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClients } from "@/hooks/use-clients";
import type {
  AgeBracket,
  Client,
  ClientStatus,
  DeliveryMethod,
  SessionFrequency,
} from "@/lib/db/types";
import {
  AGE_BRACKET_LABELS,
  AGE_BRACKETS,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
  COMMON_MODALITIES,
  DELIVERY_METHOD_LABELS,
  DELIVERY_METHODS,
  SESSION_FREQUENCIES,
  SESSION_FREQUENCY_LABELS,
} from "@/lib/db/types";
import { ChevronDownIcon } from "./icons";
import { TagInput } from "./tag-input";

interface ClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onSuccess?: (client: Client) => void;
}

interface ClientFormState {
  name: string;
  status: ClientStatus;
  therapeuticModalities: string[];
  presentingIssues: string;
  treatmentGoals: string;
  riskConsiderations: string;
  sessionFrequency: SessionFrequency | "";
  deliveryMethod: DeliveryMethod | "";
  sessionDurationMinutes: string;
  contractedSessions: string;
  feePerSession: string;
  therapyStartDate: string;
  referralSource: string;
  ageBracket: AgeBracket | "";
  background: string;
  supervisorNotes: string;
  tags: string[];
}

function getInitialState(client?: Client | null): ClientFormState {
  return {
    name: client?.name ?? "",
    status: client?.status ?? "active",
    therapeuticModalities: client?.therapeuticModalities ?? [],
    presentingIssues: client?.presentingIssues ?? "",
    treatmentGoals: client?.treatmentGoals ?? "",
    riskConsiderations: client?.riskConsiderations ?? "",
    sessionFrequency: client?.sessionFrequency ?? "",
    deliveryMethod: client?.deliveryMethod ?? "",
    sessionDurationMinutes: client?.sessionDurationMinutes?.toString() ?? "",
    contractedSessions: client?.contractedSessions?.toString() ?? "",
    feePerSession: client?.feePerSession?.toString() ?? "",
    therapyStartDate: client?.therapyStartDate ?? "",
    referralSource: client?.referralSource ?? "",
    ageBracket: client?.ageBracket ?? "",
    background: client?.background ?? "",
    supervisorNotes: client?.supervisorNotes ?? "",
    tags: client?.tags ?? [],
  };
}

function hasClinicalData(client?: Client | null): boolean {
  if (!client) {
    return false;
  }
  return Boolean(
    client.therapeuticModalities.length > 0 ||
      client.presentingIssues ||
      client.treatmentGoals ||
      client.riskConsiderations
  );
}

function hasSessionData(client?: Client | null): boolean {
  if (!client) {
    return false;
  }
  return Boolean(
    client.sessionFrequency ||
      client.deliveryMethod ||
      client.sessionDurationMinutes ||
      client.contractedSessions ||
      client.feePerSession ||
      client.therapyStartDate ||
      client.referralSource
  );
}

function hasClientDetails(client?: Client | null): boolean {
  if (!client) {
    return false;
  }
  return Boolean(client.ageBracket || client.background);
}

function hasProfessionalNotes(client?: Client | null): boolean {
  if (!client) {
    return false;
  }
  return Boolean(
    client.supervisorNotes || (client.tags && client.tags.length > 0)
  );
}

function SectionTrigger({ children }: { children: React.ReactNode }) {
  return (
    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-2 text-sm font-medium transition-colors hover:bg-accent [&[data-state=open]>svg]:rotate-180">
      {children}
      <ChevronDownIcon />
    </CollapsibleTrigger>
  );
}

export function ClientDialog({
  client,
  onOpenChange,
  onSuccess,
  open,
}: ClientDialogProps) {
  const [form, setForm] = useState<ClientFormState>(() =>
    getInitialState(client)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { refresh } = useClients();

  const isEditing = Boolean(client);

  // Reset form when client prop changes or dialog opens
  useEffect(() => {
    if (open) {
      setForm(getInitialState(client));
    }
  }, [open, client]);

  const updateField = <K extends keyof ClientFormState>(
    key: K,
    value: ClientFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Client name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const url = isEditing ? `/api/clients/${client?.id}` : "/api/clients";
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          status: form.status,
          therapeuticModalities: form.therapeuticModalities,
          presentingIssues: form.presentingIssues.trim() || null,
          treatmentGoals: form.treatmentGoals.trim() || null,
          riskConsiderations: form.riskConsiderations.trim() || null,
          sessionFrequency: form.sessionFrequency || null,
          deliveryMethod: form.deliveryMethod || null,
          sessionDurationMinutes: form.sessionDurationMinutes
            ? Number(form.sessionDurationMinutes)
            : null,
          contractedSessions: form.contractedSessions
            ? Number(form.contractedSessions)
            : null,
          feePerSession: form.feePerSession ? Number(form.feePerSession) : null,
          therapyStartDate: form.therapyStartDate || null,
          referralSource: form.referralSource.trim() || null,
          ageBracket: form.ageBracket || null,
          background: form.background.trim() || null,
          supervisorNotes: form.supervisorNotes.trim() || null,
          tags: form.tags,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save client");
      }

      const savedClient = await response.json();

      toast.success(isEditing ? "Client updated" : "Client created");
      refresh();
      onOpenChange(false);
      onSuccess?.(savedClient);
    } catch (_error) {
      toast.error(
        isEditing ? "Failed to update client" : "Failed to create client"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Client" : "Create Client"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the client's details."
                : "Add a new client to organize your chats."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name and Status — always visible */}
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                autoFocus
                id="name"
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Enter client name"
                value={form.name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                onValueChange={(v) => updateField("status", v as ClientStatus)}
                value={form.status}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CLIENT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clinical Context */}
            <Collapsible defaultOpen={hasClinicalData(client)}>
              <SectionTrigger>Clinical Context</SectionTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid gap-2">
                  <Label>Therapeutic Modalities</Label>
                  <TagInput
                    onChange={(v) => updateField("therapeuticModalities", v)}
                    placeholder="Add modality..."
                    suggestions={[...COMMON_MODALITIES]}
                    value={form.therapeuticModalities}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="presentingIssues">Presenting Issues</Label>
                  <Textarea
                    id="presentingIssues"
                    onChange={(e) =>
                      updateField("presentingIssues", e.target.value)
                    }
                    placeholder="Summary of why client is in therapy..."
                    rows={3}
                    value={form.presentingIssues}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="treatmentGoals">Treatment Goals</Label>
                  <Textarea
                    id="treatmentGoals"
                    onChange={(e) =>
                      updateField("treatmentGoals", e.target.value)
                    }
                    placeholder="What you're working towards..."
                    rows={3}
                    value={form.treatmentGoals}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="riskConsiderations">
                    Risk Considerations
                  </Label>
                  <Textarea
                    id="riskConsiderations"
                    onChange={(e) =>
                      updateField("riskConsiderations", e.target.value)
                    }
                    placeholder="Known risk factors, safeguarding notes..."
                    rows={3}
                    value={form.riskConsiderations}
                  />
                  <p className="text-muted-foreground text-xs">
                    Note any known risk factors. Flagged content may prompt
                    supervision reminders.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Session Details */}
            <Collapsible defaultOpen={hasSessionData(client)}>
              <SectionTrigger>Session Details</SectionTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="sessionFrequency">Frequency</Label>
                    <Select
                      onValueChange={(v) =>
                        updateField("sessionFrequency", v as SessionFrequency)
                      }
                      value={form.sessionFrequency}
                    >
                      <SelectTrigger id="sessionFrequency">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {SESSION_FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {SESSION_FREQUENCY_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="deliveryMethod">Delivery Method</Label>
                    <Select
                      onValueChange={(v) =>
                        updateField("deliveryMethod", v as DeliveryMethod)
                      }
                      value={form.deliveryMethod}
                    >
                      <SelectTrigger id="deliveryMethod">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {DELIVERY_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="sessionDuration">
                      Session Duration (mins)
                    </Label>
                    <Input
                      id="sessionDuration"
                      min="1"
                      onChange={(e) =>
                        updateField("sessionDurationMinutes", e.target.value)
                      }
                      placeholder="50"
                      type="number"
                      value={form.sessionDurationMinutes}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="contractedSessions">
                      Contracted Sessions
                    </Label>
                    <Input
                      id="contractedSessions"
                      min="1"
                      onChange={(e) =>
                        updateField("contractedSessions", e.target.value)
                      }
                      placeholder="Open-ended"
                      type="number"
                      value={form.contractedSessions}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="feePerSession">Fee per Session</Label>
                    <Input
                      id="feePerSession"
                      min="0"
                      onChange={(e) =>
                        updateField("feePerSession", e.target.value)
                      }
                      placeholder="Optional"
                      step="0.01"
                      type="number"
                      value={form.feePerSession}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="therapyStartDate">Therapy Start Date</Label>
                    <Input
                      id="therapyStartDate"
                      onChange={(e) =>
                        updateField("therapyStartDate", e.target.value)
                      }
                      type="date"
                      value={form.therapyStartDate}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="referralSource">Referral Source</Label>
                  <Input
                    id="referralSource"
                    onChange={(e) =>
                      updateField("referralSource", e.target.value)
                    }
                    placeholder="e.g. GP, self-referred, EAP"
                    value={form.referralSource}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Client Details */}
            <Collapsible defaultOpen={hasClientDetails(client)}>
              <SectionTrigger>Client Details</SectionTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid gap-2">
                  <Label htmlFor="ageBracket">Age Bracket</Label>
                  <Select
                    onValueChange={(v) =>
                      updateField("ageBracket", v as AgeBracket)
                    }
                    value={form.ageBracket}
                  >
                    <SelectTrigger id="ageBracket">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_BRACKETS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {AGE_BRACKET_LABELS[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="background">Background</Label>
                  <Textarea
                    id="background"
                    onChange={(e) => updateField("background", e.target.value)}
                    placeholder="Notes about this client..."
                    rows={3}
                    value={form.background}
                  />
                  <p className="text-muted-foreground text-xs">
                    Private notes for your reference only.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Professional Notes */}
            <Collapsible defaultOpen={hasProfessionalNotes(client)}>
              <SectionTrigger>Professional Notes</SectionTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid gap-2">
                  <Label htmlFor="supervisorNotes">Supervisor Notes</Label>
                  <Textarea
                    id="supervisorNotes"
                    onChange={(e) =>
                      updateField("supervisorNotes", e.target.value)
                    }
                    placeholder="Notes about supervision discussions..."
                    rows={3}
                    value={form.supervisorNotes}
                  />
                  <p className="text-muted-foreground text-xs">
                    Notes about supervision discussions related to this client.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>Tags</Label>
                  <TagInput
                    onChange={(v) => updateField("tags", v)}
                    placeholder="Add a tag..."
                    value={form.tags}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <DialogFooter>
            <Button
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Create Client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
