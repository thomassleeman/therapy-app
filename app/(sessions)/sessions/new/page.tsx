"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Mic,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AudioUpload } from "@/components/transcription/audio-upload";
import { SessionRecorder } from "@/components/transcription/session-recorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ClientOption {
  id: string;
  name: string;
}

type Step = "details" | "consent" | "record";

const DELIVERY_METHODS = [
  { value: "in-person", label: "In-person" },
  { value: "online", label: "Online" },
  { value: "telephone", label: "Telephone" },
] as const;

const CONSENT_BLOCKS = [
  {
    key: "recording" as const,
    title: "Session Recording",
    description: "This therapy session will be audio recorded.",
    therapistLabel: "I (therapist) consent to recording this session",
    clientLabel:
      "My client has given explicit consent to recording this session",
  },
  {
    key: "ai_transcription" as const,
    title: "AI Transcription",
    description:
      "The recording will be processed by an AI speech-to-text service to create a written transcript. Audio is processed on secure servers and is not used to train AI models.",
    therapistLabel: "I (therapist) consent to AI transcription",
    clientLabel: "My client has given explicit consent to AI transcription",
  },
  {
    key: "ai_note_generation" as const,
    title: "AI Note Generation",
    description:
      "The transcript may be processed by an AI system to generate draft clinical session notes for your review.",
    therapistLabel: "I (therapist) consent to AI-generated notes",
    clientLabel: "My client has given explicit consent to AI-generated notes",
  },
  {
    key: "data_storage" as const,
    title: "Secure Data Storage",
    description:
      "The transcript and notes will be stored securely on the platform, encrypted at rest, and subject to your data retention settings.",
    therapistLabel: "I (therapist) consent to secure data storage",
    clientLabel: "My client has given explicit consent to secure data storage",
  },
] as const;

type ConsentKey = (typeof CONSENT_BLOCKS)[number]["key"];

interface ConsentState {
  therapist: Record<ConsentKey, boolean>;
  client: Record<ConsentKey, boolean>;
}

function createEmptyConsents(): ConsentState {
  return {
    therapist: {
      recording: false,
      ai_transcription: false,
      ai_note_generation: false,
      data_storage: false,
    },
    client: {
      recording: false,
      ai_transcription: false,
      ai_note_generation: false,
      data_storage: false,
    },
  };
}

function allConsented(consents: ConsentState): boolean {
  return (
    Object.values(consents.therapist).every(Boolean) &&
    Object.values(consents.client).every(Boolean)
  );
}

function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

export default function NewSessionPage() {
  const router = useRouter();

  // Step management
  const [step, setStep] = useState<Step>("details");

  // Step 1 state
  const [sessionDate, setSessionDate] = useState(getTodayString());
  const [clientId, setClientId] = useState<string>("");
  const [deliveryMethod, setDeliveryMethod] = useState("in-person");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Step 2 state
  const [consents, setConsents] = useState<ConsentState>(createEmptyConsents());
  const [savingConsents, setSavingConsents] = useState(false);

  // Fetch clients on mount
  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch("/api/clients");
        if (res.ok) {
          const data = await res.json();
          const clientList = Array.isArray(data) ? data : (data.clients ?? []);
          setClients(
            clientList.map((c: { id: string; name: string }) => ({
              id: c.id,
              name: c.name,
            }))
          );
        }
      } catch {
        // Non-critical — therapist can proceed without client selection
      } finally {
        setLoadingClients(false);
      }
    }
    fetchClients();
  }, []);

  // Step 1: Create session
  const handleCreateSession = useCallback(async () => {
    setCreatingSession(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDate,
          clientId: clientId || undefined,
          deliveryMethod,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create session");
      }

      const session = await res.json();
      setSessionId(session.id);
      setStep("consent");
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreatingSession(false);
    }
  }, [sessionDate, clientId, deliveryMethod]);

  // Step 2: Save consents
  const handleSaveConsents = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setSavingConsents(true);
    try {
      const consentPromises: Promise<Response>[] = [];

      for (const block of CONSENT_BLOCKS) {
        consentPromises.push(
          fetch(`/api/sessions/${sessionId}/consents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              consentType: block.key,
              consentingParty: "therapist",
              consented: true,
            }),
          })
        );
        consentPromises.push(
          fetch(`/api/sessions/${sessionId}/consents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              consentType: block.key,
              consentingParty: "client",
              consented: true,
            }),
          })
        );
      }

      const results = await Promise.all(consentPromises);
      const allOk = results.every((r) => r.ok);

      if (!allOk) {
        throw new Error("Failed to save some consent records");
      }

      setStep("record");
    } catch (err) {
      console.error("Failed to save consents:", err);
    } finally {
      setSavingConsents(false);
    }
  }, [sessionId]);

  // Step 3: Complete
  const handleComplete = useCallback(() => {
    if (sessionId) {
      router.push(`/sessions/${sessionId}`);
    }
  }, [sessionId, router]);

  const updateConsent = (
    party: "therapist" | "client",
    key: ConsentKey,
    value: boolean
  ) => {
    setConsents((prev) => ({
      ...prev,
      [party]: { ...prev[party], [key]: value },
    }));
  };

  // Step indicators
  const steps = [
    { key: "details", label: "Session Details", number: 1 },
    { key: "consent", label: "Consent", number: 2 },
    { key: "record", label: "Record / Upload", number: 3 },
  ] as const;

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">New Session</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set up a new therapy session for recording and transcription.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-10 flex items-center gap-2">
        {steps.map((s, i) => (
          <div className="flex items-center gap-2" key={s.key}>
            {i > 0 && (
              <Separator
                className={`w-8 sm:w-16 ${
                  i <= currentStepIndex
                    ? "bg-primary"
                    : "bg-muted-foreground/20"
                }`}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                  i < currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : i === currentStepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < currentStepIndex ? <Check className="size-4" /> : s.number}
              </div>
              <span
                className={`hidden text-sm sm:inline ${
                  i === currentStepIndex
                    ? "font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 1: Session Details */}
      {step === "details" && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Session Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="session-date">Session Date</Label>
              <Input
                className="min-h-11"
                id="session-date"
                onChange={(e) => setSessionDate(e.target.value)}
                type="date"
                value={sessionDate}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-select">Client</Label>
              <Select onValueChange={setClientId} value={clientId}>
                <SelectTrigger className="min-h-11" id="client-select">
                  <SelectValue
                    placeholder={
                      loadingClients
                        ? "Loading clients..."
                        : "No client selected"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client selected</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Delivery Method</Label>
              <div className="flex flex-wrap gap-3">
                {DELIVERY_METHODS.map((method) => (
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                      deliveryMethod === method.value
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    }`}
                    key={method.value}
                  >
                    <input
                      checked={deliveryMethod === method.value}
                      className="sr-only"
                      name="delivery-method"
                      onChange={(e) => setDeliveryMethod(e.target.value)}
                      type="radio"
                      value={method.value}
                    />
                    <div
                      className={`size-4 rounded-full border-2 ${
                        deliveryMethod === method.value
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {deliveryMethod === method.value && (
                        <div className="mt-[3px] ml-[3px] size-[6px] rounded-full bg-white" />
                      )}
                    </div>
                    {method.label}
                  </label>
                ))}
              </div>
            </div>

            <Button
              className="w-full min-h-12"
              disabled={creatingSession || !sessionDate}
              onClick={handleCreateSession}
              size="lg"
            >
              {creatingSession ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating Session...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Consent Collection */}
      {step === "consent" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              Recording &amp; AI Processing Consent
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              Before recording, please confirm the following consents. Both you
              and your client must consent to each item for the session to be
              recorded and processed.
            </p>
          </div>

          <div className="space-y-5">
            {CONSENT_BLOCKS.map((block) => (
              <Card key={block.key}>
                <CardContent className="py-6 space-y-5">
                  <div>
                    <h3 className="text-base font-semibold">{block.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {block.description}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={consents.therapist[block.key]}
                        className="mt-0.5"
                        onCheckedChange={(checked) =>
                          updateConsent(
                            "therapist",
                            block.key,
                            checked === true
                          )
                        }
                      />
                      <span className="text-sm leading-relaxed">
                        {block.therapistLabel}
                      </span>
                    </div>

                    <div className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={consents.client[block.key]}
                        className="mt-0.5"
                        onCheckedChange={(checked) =>
                          updateConsent("client", block.key, checked === true)
                        }
                      />
                      <span className="text-sm leading-relaxed">
                        {block.clientLabel}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            Client consent should be obtained verbally or in writing before the
            session begins. By ticking the client consent boxes, you are
            confirming that explicit consent was obtained.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <Button
              className="min-h-12"
              onClick={() => setStep("details")}
              size="lg"
              variant="outline"
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button
              className="min-h-12 flex-1 sm:flex-none sm:min-w-[220px]"
              disabled={!allConsented(consents) || savingConsents}
              onClick={handleSaveConsents}
              size="lg"
            >
              {savingConsents ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving Consents...
                </>
              ) : (
                <>
                  Proceed to Recording
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Record or Upload */}
      {step === "record" && sessionId && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              Record or Upload Session Audio
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose whether to record live or upload a pre-recorded session.
            </p>
          </div>

          <Tabs defaultValue="record">
            <TabsList className="mb-4">
              <TabsTrigger className="gap-2" value="record">
                <Mic className="size-4" />
                Record Session
              </TabsTrigger>
              <TabsTrigger className="gap-2" value="upload">
                <Upload className="size-4" />
                Upload Recording
              </TabsTrigger>
            </TabsList>

            <TabsContent value="record">
              <SessionRecorder
                onComplete={handleComplete}
                sessionId={sessionId}
              />
            </TabsContent>

            <TabsContent value="upload">
              <AudioUpload onComplete={handleComplete} sessionId={sessionId} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
