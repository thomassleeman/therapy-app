"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CLINICAL_DOCUMENT_TYPES,
  DOCUMENT_TYPE_REGISTRY,
} from "@/lib/documents/types";
import type { ClinicalDocumentType, DocumentTypeConfig } from "@/lib/documents/types";
import type {
  ClinicalDocumentSummary,
  ClinicalNoteWithSession,
  TherapySessionWithClient,
} from "@/lib/db/types";

interface DocumentGenerationFormProps {
  clientId: string;
  clientName: string;
  existingDocuments: ClinicalDocumentSummary[];
  clinicalNotes: ClinicalNoteWithSession[];
  sessions: TherapySessionWithClient[];
}

export function DocumentGenerationForm({
  clientId,
  clientName,
  existingDocuments,
  clinicalNotes,
  sessions,
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

  // Data availability for the selected type
  const dataAvailability = useMemo(() => {
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ?? `Generation failed (${res.status})`
        );
      }

      const result = await res.json();
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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/clients/${clientId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Back to {clientName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          New Document
        </h1>
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

            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeSelect(type)}
                className={`flex flex-col items-start rounded-lg border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start gap-3 w-full">
                  <FileText
                    className={`size-5 mt-0.5 shrink-0 ${
                      isSelected
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      {config.label}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {config.shortDescription}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1.5">
                      {config.wordCountGuidance}
                    </p>
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
                      — not yet created for this client. You can still
                      proceed.
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2: Data Review — shown after type is selected */}
      {selectedType && dataAvailability && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium">
              2
            </div>
            <h2 className="text-lg font-medium">Available Data</h2>
          </div>

          <Card>
            <CardContent className="py-4 space-y-3">
              {dataAvailability.hasClientRecord && (
                <DataRow
                  label="Client record"
                  value="Available"
                  status="ok"
                />
              )}

              {dataAvailability.usesSessions && (
                <DataRow
                  label="Sessions"
                  value={`${dataAvailability.sessionCount} session${dataAvailability.sessionCount !== 1 ? "s" : ""} available`}
                  status={
                    dataAvailability.sessionCount === 0 ? "warning" : "ok"
                  }
                  warningText="No sessions available — the generated document will have limited clinical detail."
                />
              )}

              {dataAvailability.usesNotes && (
                <DataRow
                  label="Clinical notes"
                  value={`${dataAvailability.noteCount} note${dataAvailability.noteCount !== 1 ? "s" : ""} available`}
                  status={
                    dataAvailability.noteCount === 0 ? "warning" : "ok"
                  }
                  warningText="No clinical notes available — the generated document will have limited clinical detail."
                />
              )}

              {dataAvailability.usesDocuments && (
                <>
                  {dataAvailability.relevantDocuments.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-green-600 dark:text-green-500 shrink-0" />
                        <span className="font-medium">Prior documents</span>
                      </div>
                      <div className="ml-6 space-y-1">
                        {dataAvailability.relevantDocuments.map((doc) => (
                          <p
                            key={doc.id}
                            className="text-xs text-muted-foreground"
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
                      value="None available"
                      status="warning"
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
            type="button"
            onClick={() => setConfigExpanded(!configExpanded)}
            className="flex items-center gap-2 mb-4 group"
          >
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium">
              3
            </div>
            <h2 className="text-lg font-medium">
              Configuration
            </h2>
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
                          type="button"
                          onClick={() =>
                            setSelectedSessionIds(
                              selectedSessionIds.length === sessions.length
                                ? []
                                : sessions.map((s) => s.id)
                            )
                          }
                          className="text-xs text-primary hover:underline"
                        >
                          {selectedSessionIds.length === sessions.length
                            ? "Deselect all"
                            : "Select all"}
                        </button>
                      </div>
                      {sessions.map((session) => (
                        <label
                          key={session.id}
                          className="flex items-center gap-3 cursor-pointer py-1"
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
                          key={doc.id}
                          className="flex items-center gap-3 cursor-pointer py-1"
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
                <Label htmlFor="additional-instructions" className="text-sm font-medium">
                  Additional instructions
                </Label>
                <Textarea
                  id="additional-instructions"
                  placeholder='e.g., "Focus on the anxiety presentation rather than the relationship difficulties"'
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Custom title */}
              <div className="space-y-2">
                <Label htmlFor="custom-title" className="text-sm font-medium">
                  Custom title
                </Label>
                <Input
                  id="custom-title"
                  placeholder={`${typeConfig.label} — ${clientName}`}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
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
                  <p className="text-sm text-destructive/80 mt-1">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full min-h-12 text-base"
            disabled={isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Generating {typeConfig?.label}... This may take up to 3
                minutes.
              </>
            ) : error ? (
              "Try Again"
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
