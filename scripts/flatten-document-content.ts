/**
 * Flatten encrypted clinical_documents content from Record<string, string>
 * to { body: string }.
 *
 * This handles encrypted rows that the SQL migration cannot touch.
 * For each encrypted row: decrypt → flatten sections → re-encrypt → update.
 *
 * Usage:
 *   npx tsx scripts/flatten-document-content.ts           # run migration
 *   npx tsx scripts/flatten-document-content.ts --dry-run  # preview only
 */

import { decryptJsonb, encryptJsonb } from "@/lib/encryption/fields";
import {
  BATCH_SIZE,
  getServiceClient,
  logProgress,
} from "./encryption-migrate-utils";

const DRY_RUN = process.argv.includes("--dry-run");

// Section ordering per document type — labels must match DOCUMENT_TYPE_REGISTRY
const SECTION_ORDER: Record<string, Array<{ key: string; label: string }>> = {
  comprehensive_assessment: [
    { key: "referral_context", label: "REFERRAL & CONTEXT" },
    { key: "presenting_problems", label: "PRESENTING PROBLEMS" },
    { key: "history", label: "RELEVANT HISTORY" },
    { key: "current_functioning", label: "CURRENT FUNCTIONING" },
    { key: "risk_screen", label: "RISK SCREENING" },
    { key: "strengths_resources", label: "STRENGTHS & RESOURCES" },
    { key: "clinical_impressions", label: "CLINICAL IMPRESSIONS" },
  ],
  case_formulation: [
    { key: "summary_of_difficulties", label: "SUMMARY OF DIFFICULTIES" },
    { key: "predisposing_factors", label: "PREDISPOSING FACTORS" },
    { key: "precipitating_factors", label: "PRECIPITATING FACTORS" },
    { key: "perpetuating_factors", label: "PERPETUATING FACTORS" },
    { key: "protective_factors", label: "PROTECTIVE FACTORS" },
    { key: "working_hypothesis", label: "WORKING HYPOTHESIS" },
    { key: "implications_for_treatment", label: "IMPLICATIONS FOR TREATMENT" },
  ],
  risk_assessment: [
    { key: "risk_to_self", label: "RISK TO SELF" },
    { key: "risk_to_others", label: "RISK TO OTHERS" },
    { key: "safeguarding", label: "SAFEGUARDING CONCERNS" },
    { key: "risk_factors", label: "RISK FACTORS" },
    { key: "protective_factors", label: "PROTECTIVE FACTORS" },
    { key: "overall_risk_level", label: "OVERALL RISK LEVEL & RATIONALE" },
    { key: "recommended_actions", label: "RECOMMENDED ACTIONS" },
  ],
  risk_safety_plan: [
    { key: "identified_triggers", label: "IDENTIFIED TRIGGERS" },
    { key: "warning_signs", label: "WARNING SIGNS" },
    { key: "coping_strategies", label: "COPING STRATEGIES" },
    { key: "support_contacts", label: "SUPPORT CONTACTS" },
    {
      key: "professional_contacts",
      label: "PROFESSIONAL & EMERGENCY CONTACTS",
    },
    { key: "environment_safety", label: "MAKING THE ENVIRONMENT SAFE" },
    { key: "reasons_for_living", label: "REASONS FOR LIVING" },
    { key: "review_schedule", label: "REVIEW SCHEDULE" },
  ],
  treatment_plan: [
    {
      key: "presenting_problems_summary",
      label: "PRESENTING PROBLEMS SUMMARY",
    },
    { key: "treatment_goals", label: "TREATMENT GOALS" },
    { key: "interventions", label: "PLANNED INTERVENTIONS" },
    { key: "modality_and_approach", label: "MODALITY & APPROACH" },
    { key: "outcome_measures", label: "OUTCOME MEASURES" },
    { key: "risk_management", label: "RISK MANAGEMENT" },
    { key: "review_points", label: "REVIEW POINTS" },
  ],
  supervision_notes: [
    { key: "clients_discussed", label: "CLIENTS DISCUSSED" },
    { key: "clinical_guidance", label: "CLINICAL GUIDANCE RECEIVED" },
    { key: "ethical_reflections", label: "ETHICAL REFLECTIONS" },
    { key: "action_items", label: "ACTION ITEMS" },
    { key: "therapist_wellbeing", label: "THERAPIST WELLBEING" },
  ],
  discharge_summary: [
    { key: "referral_summary", label: "REFERRAL & PRESENTING PROBLEMS" },
    { key: "treatment_summary", label: "TREATMENT SUMMARY" },
    { key: "progress_and_outcomes", label: "PROGRESS & OUTCOMES" },
    { key: "remaining_difficulties", label: "REMAINING DIFFICULTIES" },
    { key: "risk_at_discharge", label: "RISK AT DISCHARGE" },
    { key: "recommendations", label: "RECOMMENDATIONS" },
    { key: "reason_for_ending", label: "REASON FOR ENDING" },
  ],
};

function isEncryptedContent(content: unknown): boolean {
  return (
    typeof content === "object" &&
    content !== null &&
    "_encrypted" in content &&
    typeof (content as { _encrypted: unknown })._encrypted === "string"
  );
}

function isAlreadyFlattened(content: unknown): boolean {
  return (
    typeof content === "object" &&
    content !== null &&
    "body" in content &&
    typeof (content as { body: unknown }).body === "string"
  );
}

function flattenSections(
  content: Record<string, string>,
  documentType: string
): string {
  const sections = SECTION_ORDER[documentType];
  if (!sections) {
    // Unknown type — concatenate all keys alphabetically
    console.warn(
      `  Unknown document type "${documentType}", concatenating all keys`
    );
    return Object.entries(content)
      .map(([key, text]) => `${key.toUpperCase()}\n${text}`)
      .join("\n\n");
  }

  const knownKeys = new Set(sections.map((s) => s.key));
  const parts: string[] = [];

  // Known sections in order
  for (const section of sections) {
    const text = content[section.key];
    if (text) {
      parts.push(`${section.label}\n${text}`);
    }
  }

  // Append any extra keys (e.g. _extra_0, _extra_1) that parseSections may have created
  for (const [key, text] of Object.entries(content)) {
    if (!knownKeys.has(key) && text) {
      parts.push(text); // _extra keys already include their own headers
    }
  }

  return parts.join("\n\n");
}

async function main() {
  if (DRY_RUN) {
    console.log("[flatten-document-content] DRY RUN — no changes will be written\n");
  }

  const supabase = getServiceClient();
  const table = "clinical_documents";

  let processed = 0;
  let migrated = 0;
  let skipped = 0;
  let lastCreatedAt: string | null = null;

  console.log(`[${table}] Starting flatten migration...`);

  while (true) {
    let query = supabase
      .from(table)
      .select("id, content, document_type, created_at")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (lastCreatedAt) {
      query = query.gt("created_at", lastCreatedAt);
    }

    const { data: docs, error } = await query;

    if (error) {
      console.error(`[${table}] Query error:`, error.message);
      break;
    }

    if (!docs || docs.length === 0) {
      break;
    }

    for (const doc of docs) {
      processed++;

      if (!doc.content) {
        skipped++;
        continue;
      }

      // Check if this is an encrypted record
      if (!isEncryptedContent(doc.content)) {
        // Plaintext — should have been handled by SQL migration.
        // Check if already flattened.
        if (isAlreadyFlattened(doc.content)) {
          skipped++;
          continue;
        }
        // Plaintext but not flattened and not encrypted — flatten without encryption
        const body = flattenSections(
          doc.content as Record<string, string>,
          doc.document_type
        );
        console.log(
          `  [${doc.id}] Plaintext, not yet flattened — flattening (${body.length} chars)`
        );
        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from(table)
            .update({ content: { body } })
            .eq("id", doc.id);
          if (updateError) {
            console.error(
              `  [${doc.id}] Update error:`,
              updateError.message
            );
            continue;
          }
        }
        migrated++;
        continue;
      }

      // Encrypted record — decrypt, check, flatten, re-encrypt
      try {
        const decrypted = await decryptJsonb<Record<string, string>>(
          doc.content,
          doc.id
        );

        if (isAlreadyFlattened(decrypted)) {
          skipped++;
          continue;
        }

        const body = flattenSections(decrypted, doc.document_type);
        console.log(
          `  [${doc.id}] Encrypted, flattening (${body.length} chars)`
        );

        if (!DRY_RUN) {
          const reEncrypted = await encryptJsonb({ body }, doc.id);
          const { error: updateError } = await supabase
            .from(table)
            .update({ content: reEncrypted })
            .eq("id", doc.id);
          if (updateError) {
            console.error(
              `  [${doc.id}] Update error:`,
              updateError.message
            );
            continue;
          }
        }
        migrated++;
      } catch (err) {
        console.error(
          `  [${doc.id}] Error:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    lastCreatedAt = docs.at(-1)!.created_at;
    logProgress(table, processed, migrated, skipped);
  }

  console.log(
    `\n[${table}] Complete — Processed: ${processed}, Migrated: ${migrated}, Skipped: ${skipped}`
  );
  if (DRY_RUN) {
    console.log("(Dry run — no changes were written)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
