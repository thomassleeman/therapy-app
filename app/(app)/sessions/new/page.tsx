"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MessageSquare,
  Mic,
  PenLine,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type { RecordingType } from "@/lib/db/types";

interface ClientOption {
  id: string;
  name: string;
}

type Step = "details" | "consent" | "record" | "write";

const DELIVERY_METHODS = [
  { value: "in-person", label: "In-person" },
  { value: "online", label: "Online" },
  { value: "telephone", label: "Telephone" },
] as const;

function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

export default function NewSessionPage() {
  const searchParams = useSearchParams();
  // Key forces full remount (fresh useState) on every client-side navigation to this page.
  // searchParams.toString() covers query-param changes; the pathname listener below
  // covers navigating away and back with the same (or no) query string.
  const pathname = usePathname();
  const visitRef = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — increment on every pathname change to force remount
  useEffect(() => {
    visitRef.current += 1;
  }, [pathname]);

  const formKey = `${pathname}-${searchParams.toString()}-${visitRef.current}`;

  return <NewSessionForm key={formKey} />;
}

function NewSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Step management
  const [step, setStep] = useState<Step>("details");

  // Step 1 state
  const [sessionDate, setSessionDate] = useState(getTodayString());
  const [clientId, setClientId] = useState<string>("");
  const [deliveryMethod, setDeliveryMethod] = useState("in-person");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [recordingType, setRecordingType] =
    useState<RecordingType>("full_session");
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clientFromUrl, setClientFromUrl] = useState(false);
  const [noteFormat, setNoteFormat] = useState<
    "soap" | "dap" | "birp" | "girp" | "narrative"
  >("soap");
  const [writtenNotes, setWrittenNotes] = useState("");
  const [generatingNotes, setGeneratingNotes] = useState(false);

  // Step 2 state
  const [consented, setConsented] = useState(false);
  const [savingConsents, setSavingConsents] = useState(false);

  // Fetch clients on mount and pre-select from URL if provided
  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch("/api/clients");
        if (res.ok) {
          const data = await res.json();
          const clientList = Array.isArray(data) ? data : (data.clients ?? []);
          const mapped = clientList.map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          }));
          setClients(mapped);

          // Pre-select client from URL query parameter
          const urlClientId = searchParams.get("clientId");
          if (
            urlClientId &&
            mapped.some((c: ClientOption) => c.id === urlClientId)
          ) {
            setClientId(urlClientId);
            setClientFromUrl(true);
          }
        }
      } catch {
        // Client fetch failed — user will see empty state
      } finally {
        setLoadingClients(false);
      }
    }
    fetchClients();
  }, [searchParams]);

  // Step 1: Create session
  const handleCreateSession = useCallback(async () => {
    setCreatingSession(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDate,
          clientId,
          deliveryMethod,
          recordingType,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create session");
      }

      const session = await res.json();
      setSessionId(session.id);
      setStep(recordingType === "written_notes" ? "write" : "consent");
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreatingSession(false);
    }
  }, [sessionDate, clientId, deliveryMethod, recordingType]);

  // Written notes: save + generate
  const handleGenerateFromWrittenNotes = useCallback(async () => {
    if (!sessionId || !writtenNotes.trim()) {
      return;
    }
    setGeneratingNotes(true);
    try {
      // Save latest written notes to the session
      const patchRes = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writtenNotes }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to save written notes");
      }

      // Generate clinical notes
      const genRes = await fetch("/api/notes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          noteFormat,
        }),
      });
      if (!genRes.ok) {
        const data = await genRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate notes");
      }

      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      console.error("Failed to generate notes:", err);
    } finally {
      setGeneratingNotes(false);
    }
  }, [sessionId, writtenNotes, noteFormat, router]);

  // Step 2: Save consents
  const handleSaveConsents = useCallback(async () => {
    if (!sessionId) { return; }
    setSavingConsents(true);

    try {
      const consentTypes = ['recording', 'ai_transcription', 'ai_note_generation', 'data_storage'];
      const parties = recordingType === 'full_session'
        ? ['therapist', 'client']
        : ['therapist'];

      const consentRecords = consentTypes.flatMap((consentType) =>
        parties.map((party) => ({
          consentType,
          consentingParty: party,
          consented: true,
          consentMethod: party === 'therapist' ? 'in_app_checkbox' : 'verbal_recorded',
        }))
      );

      await Promise.all(
        consentRecords.map((record) =>
          fetch(`/api/sessions/${sessionId}/consents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          })
        )
      );

      setStep('record');
    } catch (error) {
      console.error('Failed to save consents:', error);
    } finally {
      setSavingConsents(false);
    }
  }, [sessionId, recordingType]);

  // Step 3: Complete
  const handleComplete = useCallback(() => {
    if (sessionId) {
      router.push(`/sessions/${sessionId}`);
    }
  }, [sessionId, router]);

  // Step indicators
  const steps =
    recordingType === "written_notes"
      ? ([
          { key: "details", label: "Session Details", number: 1 },
          { key: "write", label: "Write Notes", number: 2 },
        ] as const)
      : ([
          { key: "details", label: "Session Details", number: 1 },
          { key: "consent", label: "Consent", number: 2 },
          { key: "record", label: "Record / Upload", number: 3 },
        ] as const);

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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
              <Label htmlFor="client-select">
                Client <span className="text-destructive">*</span>
              </Label>
              {loadingClients ? (
                <div className="flex items-center gap-2 min-h-11 px-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading clients...
                </div>
              ) : clients.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  You need to add a client before creating a session.{" "}
                  <Link
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                    href="/clients"
                  >
                    Go to Clients
                  </Link>
                </div>
              ) : clientFromUrl ? (
                <div className="flex items-center justify-between min-h-11 rounded-md border bg-muted/50 px-3 py-2">
                  <span className="text-sm font-medium">
                    {clients.find((c) => c.id === clientId)?.name}
                  </span>
                  <button
                    className="text-xs text-primary underline underline-offset-4 hover:text-primary/80"
                    onClick={() => setClientFromUrl(false)}
                    type="button"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <Select onValueChange={setClientId} value={clientId}>
                  <SelectTrigger className="min-h-11" id="client-select">
                    <SelectValue placeholder="Select a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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

            <Separator />

            <div className="space-y-3">
              <Label>How will you capture this session?</Label>
              <div className="flex flex-col gap-3">
                <button
                  className={`flex items-start gap-4 rounded-lg border px-4 py-4 text-left transition-colors ${
                    recordingType === "full_session"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setRecordingType("full_session")}
                  type="button"
                >
                  <Mic className="size-5 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">
                      Record the full session
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Record or upload the session audio. Both you and your
                      client must consent.
                    </div>
                  </div>
                </button>
                <button
                  className={`flex items-start gap-4 rounded-lg border px-4 py-4 text-left transition-colors ${
                    recordingType === "therapist_summary"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setRecordingType("therapist_summary")}
                  type="button"
                >
                  <MessageSquare className="size-5 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Record a summary</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Record yourself summarising the session afterwards. Only
                      your consent is needed.
                    </div>
                  </div>
                </button>
                <button
                  className={`flex items-start gap-4 rounded-lg border px-4 py-4 text-left transition-colors ${
                    recordingType === "written_notes"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setRecordingType("written_notes")}
                  type="button"
                >
                  <PenLine className="size-5 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">
                      Write session notes
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Type or paste brief notes. The AI will expand them into
                      full clinical notes.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {recordingType === "written_notes" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label>Note format</Label>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        { value: "soap", label: "SOAP" },
                        { value: "dap", label: "DAP" },
                        { value: "birp", label: "BIRP" },
                        { value: "girp", label: "GIRP" },
                        { value: "narrative", label: "Narrative" },
                      ] as const
                    ).map((fmt) => (
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                          noteFormat === fmt.value
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted"
                        }`}
                        key={fmt.value}
                      >
                        <input
                          checked={noteFormat === fmt.value}
                          className="sr-only"
                          name="note-format"
                          onChange={() => setNoteFormat(fmt.value)}
                          type="radio"
                        />
                        <div
                          className={`size-4 rounded-full border-2 ${
                            noteFormat === fmt.value
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {noteFormat === fmt.value && (
                            <div className="mt-[3px] ml-[3px] size-[6px] rounded-full bg-white" />
                          )}
                        </div>
                        {fmt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Button
              className="w-full min-h-12"
              disabled={creatingSession || !sessionDate || !clientId}
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
        <div className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>
                {recordingType === "therapist_summary"
                  ? "AI Processing Consent"
                  : "Recording & AI Processing Consent"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {recordingType === "therapist_summary"
                  ? "Before recording your session summary, please review the following."
                  : "Before recording, please review the following. By proceeding, you confirm that both you and your client consent to each item."}
              </p>

              <ol className="space-y-4">
                <li className="pl-4 border-l-2 border-muted">
                  <p className="text-sm font-medium">
                    {recordingType === "therapist_summary"
                      ? "Summary Recording"
                      : "Session Recording"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                    {recordingType === "therapist_summary"
                      ? "Your spoken session summary will be audio recorded."
                      : "This therapy session will be audio recorded."}
                  </p>
                </li>
                <li className="pl-4 border-l-2 border-muted">
                  <p className="text-sm font-medium">AI Transcription</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                    The recording will be processed by an AI speech-to-text
                    service to create a written transcript. Audio is processed
                    on secure servers and is not used to train AI models.
                  </p>
                </li>
                <li className="pl-4 border-l-2 border-muted">
                  <p className="text-sm font-medium">AI Note Generation</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                    The transcript may be processed by an AI system to generate
                    draft clinical session notes for your review.
                  </p>
                </li>
                <li className="pl-4 border-l-2 border-muted">
                  <p className="text-sm font-medium">Secure Data Storage</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                    The transcript and notes will be stored securely on the
                    platform, encrypted at rest, and subject to your data
                    retention settings.
                  </p>
                </li>
              </ol>

              <Separator />

              <div className="flex items-start gap-3">
                <Checkbox
                  checked={consented}
                  className="mt-0.5"
                  id="consent-checkbox"
                  onCheckedChange={(checked) => setConsented(checked === true)}
                />
                <Label
                  className="text-sm leading-relaxed font-normal cursor-pointer"
                  htmlFor="consent-checkbox"
                >
                  {recordingType === "therapist_summary"
                    ? "I consent to the recording and AI processing of my session summary as described above."
                    : "I consent to the above, and I confirm that my client has given explicit verbal or written consent to the recording and AI processing of this session."}
                </Label>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {recordingType === "therapist_summary"
                  ? "As with all clinical documentation, ensure your record-keeping practices comply with your professional body\u2019s ethical framework and applicable data protection legislation."
                  : "Client consent should be obtained verbally or in writing before the session begins. By ticking the box above, you are confirming that explicit consent was obtained."}
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
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
              disabled={!consented || savingConsents}
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

      {/* Step: Written Notes */}
      {step === "write" && sessionId && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Session Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              className="min-h-[200px] resize-y"
              onChange={(e) => setWrittenNotes(e.target.value)}
              placeholder="Enter unformatted notes"
              rows={12}
              value={writtenNotes}
            />
            <div className="flex justify-end gap-2">
              <Button
                className="min-h-11"
                onClick={() => setStep("details")}
                variant="outline"
              >
                Back
              </Button>
              <Button
                className="min-h-11"
                disabled={!writtenNotes.trim() || generatingNotes}
                onClick={handleGenerateFromWrittenNotes}
              >
                {generatingNotes ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating notes...
                  </>
                ) : (
                  "Generate Notes"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Record or Upload */}
      {step === "record" && sessionId && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {recordingType === "therapist_summary"
                ? "Record or Upload Your Session Summary"
                : "Record or Upload Session Audio"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {recordingType === "therapist_summary"
                ? "Choose whether to record now or upload a pre-recorded summary."
                : "Choose whether to record live or upload a pre-recorded session."}
            </p>
          </div>

          <Tabs defaultValue="record">
            <TabsList className="mb-4">
              <TabsTrigger className="gap-2" value="record">
                <Mic className="size-4" />
                {recordingType === "therapist_summary"
                  ? "Record Summary"
                  : "Record Session"}
              </TabsTrigger>
              <TabsTrigger className="gap-2" value="upload">
                <Upload className="size-4" />
                {recordingType === "therapist_summary"
                  ? "Upload Summary"
                  : "Upload Recording"}
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
