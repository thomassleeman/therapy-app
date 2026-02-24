// lib/ai/sensitive-content.ts
//
// Lightweight keyword-based sensitive content detection for therapist messages.
// Runs on every message — no LLM calls, just pattern matching.
//
// Design principle: false positives are acceptable, false negatives are NOT.
// This means patterns are intentionally broad. A match triggers additional
// safety instructions and (where appropriate) auto-searches of legislation.

// ── Types ─────────────────────────────────────────────────────────────────

export type SensitiveCategory =
  | "safeguarding"
  | "suicidal_ideation"
  | "therapist_distress";

export interface SensitiveContentDetection {
  /** Which categories were detected (may be empty). */
  detectedCategories: SensitiveCategory[];
  /** Combined instructions to append to the LLM system prompt. */
  additionalInstructions: string;
  /** Tool queries to auto-trigger (e.g. searchLegislation calls). */
  autoSearchQueries: AutoSearchQuery[];
}

export interface AutoSearchQuery {
  /** Which search tool to invoke. */
  tool: "searchLegislation" | "searchGuidelines" | "searchTherapeuticContent";
  /** The query string to pass. */
  query: string;
}

// ── Pattern definitions ───────────────────────────────────────────────────
// Each category defines:
//   - keywords: exact lowercase tokens checked via word-boundary matching
//   - phrases: multi-word patterns checked via substring matching
//   - instructions: text appended to the LLM prompt when detected
//   - autoSearchQueries: tool calls to auto-trigger

interface CategoryDefinition {
  keywords: string[];
  phrases: string[];
  instructions: string;
  autoSearchQueries: AutoSearchQuery[];
}

const SAFEGUARDING: CategoryDefinition = {
  keywords: [
    "safeguarding",
    "disclosure",
    "abuse",
    "neglect",
    "trafficking",
    "exploitation",
    "grooming",
  ],
  phrases: [
    "child protection",
    "harm to children",
    "duty to report",
    "vulnerable adult",
    "mandatory reporting",
    "duty of care",
    "child abuse",
    "domestic violence",
    "domestic abuse",
    "forced marriage",
    "female genital mutilation",
    "fgm",
    "county lines",
    "modern slavery",
    "elder abuse",
    "at risk adult",
    "safeguarding concern",
    "safeguarding referral",
    "children act",
    "care act",
  ],
  instructions: [
    "SAFEGUARDING DETECTED: This query involves potential safeguarding concerns.",
    "You MUST include the following in your response:",
    "1. Reference the therapist's statutory obligations under the Children Act 2004 and/or Care Act 2014 as appropriate.",
    '2. Include this statement verbatim: "Safeguarding responsibilities take precedence over confidentiality — consult your safeguarding lead."',
    "3. Do NOT attempt to determine whether a safeguarding threshold has been met — that is a clinical and organisational decision.",
    "4. Direct the therapist to their organisation's safeguarding policy and designated safeguarding lead.",
    "5. If the concern involves a child, reference the local authority children's services referral pathway.",
    "6. If the concern involves a vulnerable adult, reference the local authority adult safeguarding team.",
  ].join("\n"),
  autoSearchQueries: [
    {
      tool: "searchLegislation",
      query: "Children Act 2004 safeguarding duties",
    },
    { tool: "searchLegislation", query: "Care Act 2014 adult safeguarding" },
  ],
};

const SUICIDAL_IDEATION: CategoryDefinition = {
  keywords: [
    "suicidal",
    "suicide",
    "self-harm",
    "self-injury",
    "overdose",
    "parasuicide",
  ],
  phrases: [
    "wants to end their life",
    "wants to end his life",
    "wants to end her life",
    "want to end their life",
    "client mentioned dying",
    "mentioned dying",
    "talked about dying",
    "risk assessment",
    "risk to self",
    "risk of harm",
    "suicidal ideation",
    "suicidal thoughts",
    "ending their life",
    "ending his life",
    "ending her life",
    "not wanting to be here",
    "doesn't want to be alive",
    "doesn't want to live",
    "no reason to live",
    "plan to harm",
    "intent to harm",
    "thoughts of death",
    "death wish",
    "self-harming",
    "cutting themselves",
    "cutting herself",
    "cutting himself",
    "safety plan",
    "crisis plan",
    "crisis intervention",
  ],
  instructions: [
    "SUICIDAL IDEATION / SELF-HARM DETECTED: This query involves client risk.",
    "You MUST follow these guidelines:",
    "1. Reference risk assessment frameworks from the knowledge base if available.",
    "2. NEVER attempt to assess the client's risk level — this is a clinical responsibility.",
    "3. NEVER provide a risk rating, score, or categorisation (low/medium/high).",
    '4. Include this statement verbatim: "Risk assessment is a clinical responsibility — please follow your service\'s risk protocol and discuss with your supervisor."',
    "5. You may discuss general risk assessment frameworks, safety planning principles, and evidence-based approaches.",
    "6. Encourage the therapist to document their clinical reasoning and any actions taken.",
    "7. If the therapist describes an imminent risk situation, remind them to follow their service's emergency protocol.",
  ].join("\n"),
  autoSearchQueries: [
    {
      tool: "searchGuidelines",
      query: "risk assessment framework suicide self-harm",
    },
  ],
};

const THERAPIST_DISTRESS: CategoryDefinition = {
  keywords: ["burnt out", "burnout", "burn-out", "overwhelmed"],
  phrases: [
    "i'm struggling",
    "i am struggling",
    "can't cope",
    "cannot cope",
    "vicarious trauma",
    "compassion fatigue",
    "secondary trauma",
    "secondary traumatic stress",
    "this work is affecting me",
    "affecting my wellbeing",
    "affecting my well-being",
    "i feel overwhelmed",
    "emotionally exhausted",
    "emotional exhaustion",
    "professional burnout",
    "losing empathy",
    "feeling hopeless",
    "dreading sessions",
    "dreading work",
    "can't sleep because of work",
    "thinking about leaving the profession",
    "not coping",
    "struggling to cope",
    "work is too much",
    "i need help",
    "taking it home",
    "bringing it home",
    "affecting my personal life",
  ],
  instructions: [
    "THERAPIST DISTRESS DETECTED: The therapist appears to be describing their own wellbeing concerns.",
    "You MUST follow these guidelines:",
    "1. Validate their experience — working in therapy is demanding and these feelings are a normal response to difficult work.",
    "2. Normalise the experience without minimising it.",
    "3. Suggest accessing clinical supervision to discuss the emotional impact of their work.",
    "4. Mention self-care strategies and professional support resources (e.g. their professional body's support services, peer support groups).",
    "5. Do NOT attempt to provide therapy to the therapist — you are a reflection tool, not a therapist.",
    "6. Do NOT diagnose or pathologise their experience.",
    "7. If the distress sounds severe (e.g. mentions of personal self-harm or inability to function), gently suggest they speak with their GP or a personal therapist.",
  ].join("\n"),
  autoSearchQueries: [
    {
      tool: "searchGuidelines",
      query: "therapist self-care supervision wellbeing compassion fatigue",
    },
  ],
};

const CATEGORIES: Record<SensitiveCategory, CategoryDefinition> = {
  safeguarding: SAFEGUARDING,
  suicidal_ideation: SUICIDAL_IDEATION,
  therapist_distress: THERAPIST_DISTRESS,
};

// ── Detection logic ───────────────────────────────────────────────────────

/**
 * Check whether a message matches any keyword in a category.
 *
 * - Single-word keywords use word-boundary matching (`\b`) to avoid
 *   false matches inside longer words (e.g. "abuse" shouldn't match
 *   "disabuse" is unlikely but we'd rather have the false positive).
 *   Actually, we use a simpler approach: we check keywords with \b
 *   and phrases with plain includes().
 *
 * - Multi-word phrases use substring matching (case-insensitive).
 */
function matchesCategory(
  normalisedMessage: string,
  definition: CategoryDefinition
): boolean {
  // Check multi-word phrases first (substring match)
  for (const phrase of definition.phrases) {
    if (normalisedMessage.includes(phrase)) {
      return true;
    }
  }

  // Check single keywords with word-boundary regex
  for (const keyword of definition.keywords) {
    // Escape any regex-special characters in the keyword
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(normalisedMessage)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect sensitive content patterns in a therapist's message.
 *
 * This is a lightweight, keyword-based check that runs on every message.
 * It does NOT use an LLM — it's pure string matching designed to be fast
 * and to err on the side of false positives (safe) rather than false
 * negatives (dangerous).
 *
 * @param message - The therapist's message text
 * @returns Detection result with categories, instructions, and auto-search queries
 */
export function detectSensitiveContent(
  message: string
): SensitiveContentDetection {
  if (!message || message.trim().length === 0) {
    return {
      detectedCategories: [],
      additionalInstructions: "",
      autoSearchQueries: [],
    };
  }

  // Normalise: lowercase for matching, collapse whitespace
  const normalised = message.toLowerCase().replace(/\s+/g, " ").trim();

  const detectedCategories: SensitiveCategory[] = [];
  const instructionBlocks: string[] = [];
  const autoSearchQueries: AutoSearchQuery[] = [];

  // Check each category
  for (const [category, definition] of Object.entries(CATEGORIES) as [
    SensitiveCategory,
    CategoryDefinition,
  ][]) {
    if (matchesCategory(normalised, definition)) {
      detectedCategories.push(category);
      instructionBlocks.push(definition.instructions);
      autoSearchQueries.push(...definition.autoSearchQueries);
    }
  }

  return {
    detectedCategories,
    additionalInstructions: instructionBlocks.join("\n\n"),
    autoSearchQueries,
  };
}
