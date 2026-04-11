"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  FileText,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ClinicalDocumentSummary,
  ClinicalNoteWithSession,
  TherapySessionWithClient,
} from "@/lib/db/types";
import type {
  DataAvailability,
  SufficiencyResult,
} from "@/lib/documents/sufficiency";
import { checkDocumentSufficiency } from "@/lib/documents/sufficiency";
import type {
  ClinicalDocumentType,
  DocumentTypeConfig,
} from "@/lib/documents/types";
import {
  CLINICAL_DOCUMENT_TYPES,
  DOCUMENT_TYPE_REGISTRY,
} from "@/lib/documents/types";

interface DocumentGenerationFormProps {
  clientId: string;
  clientName: string;
  existingDocuments: ClinicalDocumentSummary[];
  clinicalNotes: ClinicalNoteWithSession[];
  sessions: TherapySessionWithClient[];
  dataAvailability: DataAvailability;
}

export function DocumentGenerationForm({
  clientId,
  clientName,
  existingDocuments,
  clinicalNotes,
  sessions,
  dataAvailability,
}: DocumentGenerationFormProps) {
  const router = useRouter();

  // Form state
  const [selectedType, setSelectedType] = useState<ClinicalDocumentType | null>(
    null
  );
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(
    sessions.map((s) => s.id)
  );
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [configExpanded, setConfigExpanded] = useState(true);

  // Submission state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeConfig: DocumentTypeConfig | null = selectedType
    ? DOCUMENT_TYPE_REGISTRY[selectedType]
    : null;

  // Sufficiency check for the selected type
  const [sufficiency, setSufficiency] = useState<SufficiencyResult | null>(
    null
  );

  useEffect(() => {
    if (selectedType) {
      const result = checkDocumentSufficiency(selectedType, dataAvailability);
      setSufficiency(result);
    } else {
      setSufficiency(null);
    }
  }, [selectedType, dataAvailability]);

  // Pre-compute sufficiency for all types (for card indicators)
  const sufficiencyByType = useMemo(() => {
    const results: Partial<Record<ClinicalDocumentType, SufficiencyResult>> =
      {};
    for (const type of CLINICAL_DOCUMENT_TYPES) {
      results[type] = checkDocumentSufficiency(type, dataAvailability);
    }
    return results;
  }, [dataAvailability]);

  // Check which prerequisites are missing for each type
  const missingPrerequisites = useMemo(() => {
    const result: Partial<
      Record<ClinicalDocumentType, ClinicalDocumentType[]>
    > = {};
    for (const type of CLINICAL_DOCUMENT_TYPES) {
      const config = DOCUMENT_TYPE_REGISTRY[type];
      const missing = config.advisoryPrerequisites.filter(
        (prereq) =>
          !existingDocuments.some((doc) => doc.documentType === prereq)
      );
      if (missing.length > 0) {
        result[type] = missing;
      }
    }
    return result;
  }, [existingDocuments]);

  // Pre-check prerequisite documents when a type is selected
  const handleTypeSelect = (type: ClinicalDocumentType) => {
    setSelectedType(type);
    const config = DOCUMENT_TYPE_REGISTRY[type];

    // Pre-check prerequisite documents
    if (config.dataSources.includes("clinical_documents")) {
      const prereqDocIds = existingDocuments
        .filter((doc) =>
          config.advisoryPrerequisites.includes(doc.documentType)
        )
        .map((doc) => doc.id);
      setSelectedDocumentIds(prereqDocIds);
    } else {
      setSelectedDocumentIds([]);
    }

    // Reset session selection to all
    setSelectedSessionIds(sessions.map((s) => s.id));
  };

  // Per-type data source summary for display in Step 2
  const typeDataSummary = useMemo(() => {
    if (!typeConfig) return null;

    const sources = typeConfig.dataSources;
    return {
      hasClientRecord: sources.includes("client_record"),
      usesSessions: sources.includes("session_history"),
      sessionCount: sessions.length,
      usesNotes: sources.includes("clinical_notes"),
      noteCount: clinicalNotes.length,
      usesDocuments: sources.includes("clinical_documents"),
      relevantDocuments: existingDocuments,
    };
  }, [typeConfig, sessions.length, clinicalNotes.length, existingDocuments]);

  const toggleSession = (sessionId: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const toggleDocument = (docId: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  const handleGenerate = async () => {
    if (!selectedType) return;

    setIsGenerating(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        clientId,
        documentType: selectedType,
      };

      if (
        typeConfig?.dataSources.includes("session_history") &&
        selectedSessionIds.length < sessions.length
      ) {
        body.sessionIds = selectedSessionIds;
      }

      if (selectedDocumentIds.length > 0) {
        body.referenceDocumentIds = selectedDocumentIds;
      }

      if (additionalInstructions.trim()) {
        body.additionalInstructions = additionalInstructions.trim();
      }

      if (customTitle.trim()) {
        body.title = customTitle.trim();
      }

      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 422) {
        const errorData = await res
          .json()
          .catch(() => ({ blockers: [], warnings: [] }));
        setSufficiency({
          canGenerate: false,
          blockers: errorData.blockers || [],
          warnings: errorData.warnings || [],
          dataAvailable: dataAvailability,
        });
        setIsGenerating(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Generation failed (${res.status})`);
      }

      const result = await res.json();
      if (result.commentary) {
        sessionStorage.setItem(
          `doc-commentary-${result.id}`,
          result.commentary
        );
      }
      router.push(`/clients/${clientId}/documents/${result.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setIsGenerating(false);
    }
  };

  const formatSessionDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="mx-auto min-h-0 flex-1 overflow-y-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          href={`/clients/${clientId}`}
        >
          <ArrowLeft className="size-4" />
          Back to {clientName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New Document</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate a clinical document for {clientName}.
        </p>
      </div>

      {/* Step 1: Select Document Type */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div
            className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
              selectedType
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {selectedType ? <Check className="size-3.5" /> : "1"}
          </div>
          <h2 className="text-lg font-medium">Select Document Type</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CLINICAL_DOCUMENT_TYPES.map((type) => {
            const config = DOCUMENT_TYPE_REGISTRY[type];
            const isSelected = selectedType === type;
            const missing = missingPrerequisites[type];
            const typeSufficiency = sufficiencyByType[type];

            return (
              <button
                className={`flex flex-col items-start rounded-lg border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50"
                }`}
                key={type}
                onClick={() => handleTypeSelect(type)}
                type="button"
              >
                <div className="flex items-start gap-3 w-full">
                  <FileText
                    className={`size-5 mt-0.5 shrink-0 ${
                      isSelected ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{config.label}</div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {config.shortDescription}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1.5">
                      {config.wordCountGuidance}
                    </p>
                    {/* Sufficiency indicator */}
                    {typeSufficiency && typeSufficiency.blockers.length > 0 && (
                      <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mt-1.5">
                        <CircleX className="size-3.5 shrink-0" />
                        Insufficient data
                      </p>
                    )}
                    {typeSufficiency &&
                      typeSufficiency.blockers.length === 0 &&
                      typeSufficiency.warnings.length > 0 && (
                        <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                          <AlertTriangle className="size-3.5 shrink-0" />
                          Limited data available
                        </p>
                      )}
                    {typeSufficiency &&
                      typeSufficiency.blockers.length === 0 &&
                      typeSufficiency.warnings.length === 0 && (
                        <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-1.5">
                          <CircleCheck className="size-3.5 shrink-0" />
                          Ready to generate
                        </p>
                      )}
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="size-5 text-primary shrink-0" />
                  )}
                </div>
                {missing && missing.length > 0 && (
                  <div className="mt-3 w-full rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Recommended prerequisite:{" "}
                      {missing
                        .map((m) => DOCUMENT_TYPE_REGISTRY[m].label)
                        .join(", ")}{" "}
                      — not yet created for this client. You can still proceed.
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2: Data Review — shown after type is selected */}
      {selectedType && typeDataSummary && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium">
              2
            </div>
            <h2 className="text-lg font-medium">Available Data</h2>
          </div>

          {/* Sufficiency alerts */}
          {sufficiency && sufficiency.blockers.length > 0 && (
            <Alert className="mb-4" variant="destructive">
              <CircleX className="size-4" />
              <AlertTitle>Cannot generate — insufficient data</AlertTitle>
              <AlertDescription>
                {sufficiency.blockers.map((blocker) => (
                  <p className="mt-1" key={blocker}>
                    {blocker}
                  </p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {sufficiency &&
            sufficiency.blockers.length === 0 &&
            sufficiency.warnings.length > 0 && (
              <Alert className="mb-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-500">
                <AlertTriangle className="size-4" />
                <AlertTitle>Limited source data</AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-300">
                  {sufficiency.warnings.map((warning) => (
                    <p className="mt-1" key={warning}>
                      {warning}
                    </p>
                  ))}
                  <p className="mt-2 text-xs">
                    You can still generate this document, but the output may be
                    incomplete. Consider addressing the gaps above first.
                  </p>
                </AlertDescription>
              </Alert>
            )}

          {sufficiency &&
            sufficiency.blockers.length === 0 &&
            sufficiency.warnings.length === 0 && (
              <Alert className="mb-4 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200 [&>svg]:text-green-600 dark:[&>svg]:text-green-500">
                <CircleCheck className="size-4" />
                <AlertTitle>Ready to generate</AlertTitle>
                <AlertDescription className="text-green-800 dark:text-green-300">
                  All recommended source data is available. The document should
                  generate with good clinical detail.
                </AlertDescription>
              </Alert>
            )}

          <Card>
            <CardContent className="py-4 space-y-3">
              {typeDataSummary.hasClientRecord && (
                <DataRow label="Client record" status="ok" value="Available" />
              )}

              {typeDataSummary.usesSessions && (
                <DataRow
                  label="Sessions"
                  status={typeDataSummary.sessionCount === 0 ? "warning" : "ok"}
                  value={`${typeDataSummary.sessionCount} session${typeDataSummary.sessionCount === 1 ? "" : "s"} available`}
                  warningText="No sessions available — the generated document will have limited clinical detail."
                />
              )}

              {typeDataSummary.usesNotes && (
                <DataRow
                  label="Clinical notes"
                  status={typeDataSummary.noteCount === 0 ? "warning" : "ok"}
                  value={`${typeDataSummary.noteCount} note${typeDataSummary.noteCount === 1 ? "" : "s"} available`}
                  warningText="No clinical notes available — the generated document will have limited clinical detail."
                />
              )}

              {typeDataSummary.usesDocuments && (
                <>
                  {typeDataSummary.relevantDocuments.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-green-600 dark:text-green-500 shrink-0" />
                        <span className="font-medium">Prior documents</span>
                      </div>
                      <div className="ml-6 space-y-1">
                        {typeDataSummary.relevantDocuments.map((doc) => (
                          <p
                            className="text-xs text-muted-foreground"
                            key={doc.id}
                          >
                            {doc.title} (
                            {DOCUMENT_TYPE_REGISTRY[doc.documentType].label})
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <DataRow
                      label="Prior documents"
                      status="warning"
                      value="None available"
                      warningText="No prior documents available to reference."
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Step 3: Optional Configuration */}
      {selectedType && typeConfig && (
        <section className="mb-10">
          <button
            className="flex items-center gap-2 mb-4 group"
            onClick={() => setConfigExpanded(!configExpanded)}
            type="button"
          >
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium">
              3
            </div>
            <h2 className="text-lg font-medium">Configuration</h2>
            <span className="text-xs text-muted-foreground ml-1">
              (optional)
            </span>
            {configExpanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>

          {configExpanded && (
            <div className="space-y-6">
              {/* Session filter */}
              {typeConfig.dataSources.includes("session_history") &&
                sessions.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Include sessions
                    </Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Deselect sessions you don&apos;t want included in the
                      document.
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
                          {selectedSessionIds.length} of {sessions.length}{" "}
                          selected
                        </span>
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() =>
                            setSelectedSessionIds(
                              selectedSessionIds.length === sessions.length
                                ? []
                                : sessions.map((s) => s.id)
                            )
                          }
                          type="button"
                        >
                          {selectedSessionIds.length === sessions.length
                            ? "Deselect all"
                            : "Select all"}
                        </button>
                      </div>
                      {sessions.map((session) => (
                        <label
                          className="flex items-center gap-3 cursor-pointer py-1"
                          key={session.id}
                        >
                          <Checkbox
                            checked={selectedSessionIds.includes(session.id)}
                            onCheckedChange={() => toggleSession(session.id)}
                          />
                          <span className="text-sm">
                            {formatSessionDate(session.sessionDate)}
                            {session.durationMinutes && (
                              <span className="text-muted-foreground">
                                {" "}
                                ({session.durationMinutes} min)
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

              {/* Reference documents */}
              {typeConfig.dataSources.includes("clinical_documents") &&
                existingDocuments.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Reference documents
                    </Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Select prior documents to inform the generation.
                      Prerequisites are pre-selected.
                    </p>
                    <div className="rounded-md border p-3 space-y-2">
                      {existingDocuments.map((doc) => (
                        <label
                          className="flex items-center gap-3 cursor-pointer py-1"
                          key={doc.id}
                        >
                          <Checkbox
                            checked={selectedDocumentIds.includes(doc.id)}
                            onCheckedChange={() => toggleDocument(doc.id)}
                          />
                          <div className="text-sm">
                            <span>{doc.title}</span>
                            <span className="text-muted-foreground ml-1.5">
                              ({DOCUMENT_TYPE_REGISTRY[doc.documentType].label})
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

              {/* Additional instructions */}
              <div className="space-y-2">
                <Label
                  className="text-sm font-medium"
                  htmlFor="additional-instructions"
                >
                  Additional instructions
                </Label>
                <Textarea
                  className="resize-none"
                  id="additional-instructions"
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder='e.g., "Focus on the anxiety presentation rather than the relationship difficulties"'
                  rows={3}
                  value={additionalInstructions}
                />
              </div>

              {/* Custom title */}
              <div className="space-y-2">
                <Label className="text-sm font-medium" htmlFor="custom-title">
                  Custom title
                </Label>
                <Input
                  id="custom-title"
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={`${typeConfig.label} — ${clientName}`}
                  value={customTitle}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Step 4: Generate */}
      {selectedType && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium">
              4
            </div>
            <h2 className="text-lg font-medium">Generate</h2>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">
                    Generation failed
                  </p>
                  <p className="text-sm text-destructive/80 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <Button
            className="w-full min-h-12 text-base"
            disabled={isGenerating || sufficiency?.canGenerate === false}
            onClick={handleGenerate}
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Generating {typeConfig?.label}... This may take up to 3 minutes.
              </>
            ) : sufficiency?.canGenerate === false ? (
              "Cannot generate"
            ) : error ? (
              "Try Again"
            ) : sufficiency && sufficiency.warnings.length > 0 ? (
              "Generate with limited data"
            ) : (
              `Generate ${typeConfig?.label ?? "Document"}`
            )}
          </Button>
        </section>
      )}
    </div>
  );
}

// ── Helper component ──────────────────────────────────────────────────

function DataRow({
  label,
  value,
  status,
  warningText,
}: {
  label: string;
  value: string;
  status: "ok" | "warning";
  warningText?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        {status === "ok" ? (
          <CheckCircle2 className="size-4 text-green-600 dark:text-green-500 shrink-0" />
        ) : (
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500 shrink-0" />
        )}
        <span className="font-medium">{label}:</span>
        <span
          className={
            status === "warning"
              ? "text-amber-600 dark:text-amber-500"
              : "text-muted-foreground"
          }
        >
          {value}
        </span>
      </div>
      {status === "warning" && warningText && (
        <p className="ml-6 text-xs text-amber-600 dark:text-amber-500 mt-0.5">
          {warningText}
        </p>
      )}
    </div>
  );
}
