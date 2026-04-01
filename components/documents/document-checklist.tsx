"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ClinicalDocumentSummary } from "@/lib/db/types";
import type { ClinicalDocumentType } from "@/lib/documents/types";
import { DOCUMENT_TYPE_REGISTRY } from "@/lib/documents/types";

/** Document types that contribute to agent effectiveness, in clinical workflow order. */
const CHECKLIST_TYPES: ClinicalDocumentType[] = [
  "comprehensive_assessment",
  "case_formulation",
  "risk_assessment",
  "risk_safety_plan",
  "treatment_plan",
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  finalised:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

interface DocumentChecklistProps {
  clientId: string;
  documents: ClinicalDocumentSummary[];
}

export function DocumentChecklist({
  clientId,
  documents,
}: DocumentChecklistProps) {
  // For each checklist type, find the latest non-superseded document
  const latestByType = new Map<ClinicalDocumentType, ClinicalDocumentSummary>();
  for (const doc of documents) {
    if (!CHECKLIST_TYPES.includes(doc.documentType)) continue;
    if (doc.supersedesId) continue;
    const existing = latestByType.get(doc.documentType);
    if (
      !existing ||
      new Date(doc.createdAt) > new Date(existing.createdAt)
    ) {
      latestByType.set(doc.documentType, doc);
    }
  }

  const completedCount = latestByType.size;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Clinical Documents</CardTitle>
        <CardDescription>
          {completedCount} of {CHECKLIST_TYPES.length} key documents created
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {CHECKLIST_TYPES.map((type) => {
          const doc = latestByType.get(type);
          const config = DOCUMENT_TYPE_REGISTRY[type];

          return (
            <ChecklistRow
              key={type}
              clientId={clientId}
              doc={doc}
              label={config.label}
              description={config.shortDescription}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function ChecklistRow({
  clientId,
  doc,
  label,
  description,
}: {
  clientId: string;
  doc: ClinicalDocumentSummary | undefined;
  label: string;
  description: string;
}) {
  if (doc) {
    return (
      <Link
        href={`/clients/${clientId}/documents/${doc.id}`}
        className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-accent transition-colors"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status] ?? ""}`}
            >
              {doc.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {description}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/clients/${clientId}/documents/new`}
      className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-accent transition-colors group"
    >
      <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/40" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {label}
          </span>
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            Create &rarr;
          </span>
        </div>
        <p className="text-xs text-muted-foreground/60 line-clamp-1">
          {description}
        </p>
      </div>
    </Link>
  );
}
