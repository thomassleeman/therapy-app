# AI Prompting Review — Therapy Reflection Platform

**Date:** 10 March 2026
**Scope:** Every AI prompt in the codebase, covering the reflective chat agent, clinical document generation, session note generation, session transcription pipeline, RAG contextual enrichment, post-generation faithfulness checking, query reformulation, and sensitive content safety directives.

**Revision note:** Updated from the 8 March review to reflect codebase changes including: the new clinical document generation system (`app/api/documents/generate/route.ts` and `lib/documents/specs/`), the new faithfulness check prompt, the new query reformulation prompt, the new session context injection in the chat route, the removal of `requestSuggestions`, the `ToolLoopAgent` migration, significant updates to `therapyReflectionPrompt` (voice/terminology preservation, search-first exceptions, `general_knowledge` strategy change), and the addition of MCT and ACT modalities.

---

## Table of Contents

1. [therapyReflectionPrompt — Main Agent System Prompt](#1-therapyreflectionprompt)
2. [orientationDescriptions — Therapeutic Framework Injection](#2-orientationdescriptions)
3. [getToolContextPrompt — Search Tool Routing](#3-gettoolcontextprompt)
4. [getRequestPromptFromHints — Geolocation Context](#4-getrequestpromptfromhints)
5. [artifactsPrompt — Document Tool Guidance](#5-artifactsprompt)
6. [titlePrompt — Chat Title Generation](#6-titleprompt)
7. [onCreateDocument — Artifact Creation System Prompt](#7-oncreatedocument)
8. [updateDocumentPrompt — Artifact Update System Prompt](#8-updatedocumentprompt)
9. [Sensitive Content Instructions — Safety Directives](#9-sensitive-content-instructions)
10. [buildSystemPrompt (Notes) — Clinical Note Generation](#10-buildsystemprompt-notes)
11. [FORMAT_INSTRUCTIONS — Note Format Templates](#11-format_instructions)
12. [SUMMARY_FORMAT_INSTRUCTIONS — Summary-Aware Note Templates](#12-summary_format_instructions)
13. [buildSystemPrompt (Documents) — Clinical Document Generation](#13-buildsystemprompt-documents)
14. [Document Specification Files — Per-Type Generation Specs](#14-document-specification-files)
15. [Session Context Prompt — Transcript Injection](#15-session-context-prompt)
16. [Query Reformulation Prompt — Multi-Query Retrieval](#16-query-reformulation-prompt)
17. [Faithfulness Check Prompt — Post-Generation Auditor](#17-faithfulness-check-prompt)
18. [Claude Diarization — Speaker Labelling Prompt](#18-claude-diarization)
19. [Whisper Domain Prompt — Vocabulary Hint](#19-whisper-domain-prompt)
20. [Contextual Enrichment — System Prompt](#20-contextual-enrichment-system)
21. [buildEnrichmentPrompt — Chunk Context Generation](#21-buildenrichmentprompt)
22. [Removed: requestSuggestions](#22-removed-requestsuggestions)
23. [Summary of Priorities](#23-summary-of-priorities)

---

## 1. therapyReflectionPrompt

**File:** `lib/ai/prompts.ts`
**Purpose:** The core system prompt for the reflective chat agent. Defines the agent's identity, behavioural boundaries, knowledge base usage rules, citation conventions, confidence routing, and response style. Assembled with orientation, tool context, session context, sensitive content, and request hint sub-prompts before being passed to the `ToolLoopAgent`.

### Review

This prompt has been significantly improved since the first review. It is the most important prompt in the system and is now well-structured with clear markdown sections, explicit behavioural rules, and a nuanced balance between search-first discipline and reflective flexibility.

**Strengths:**
- The "search-first rule" is explicit with well-defined exceptions (pure greetings, follow-ups where content is already in context, therapist explicitly not wanting a search). This addresses a weakness identified in the previous review where the rule was too rigid.
- The **"voice and terminology" section** (new) is excellent — it instructs the LLM to preserve specific KB language like "the thud", "cognitive bypasses", "Rule of Three", and "Head Rating vs Heart Rating" rather than paraphrasing into generic textbook vocabulary. This is a sophisticated instruction that respects the clinical authorship of the KB content.
- The instruction to "Speak *from* the content, not *about* it" prevents awkward meta-commentary about retrieval.
- Citation rules are split by `documentType` (formal for legislation/guidelines, natural for therapeutic/clinical-practice content), matching how therapists would expect to see sources.
- The three-strategy confidence routing (`grounded` / `general_knowledge` / `graceful_decline`) aligns with the CRAG router in code.
- The `general_knowledge` strategy has been improved — it no longer requires a disclaimer preamble ("I don't have specific guidance on this...") and instead notes that the UI displays an attribution badge automatically. This is better: the disclaimer was clunky and the badge handles user transparency without polluting the response.
- Professional boundaries are clearly drawn.
- Example reflective questions give the LLM concrete exemplars.

**Remaining weaknesses:**

1. **No explicit query translation guidance in the prompt itself.** The prompt tells the LLM to search first but doesn't instruct it on how to formulate effective queries. The vocabulary mismatch between therapist language and KB terminology is partially addressed by the new `query-reformulation.ts` module (see section 16), but that module is feature-gated behind `ENABLE_QUERY_REFORMULATION=true`. When disabled, the LLM is still searching with the therapist's raw language. Adding prompt-level guidance would provide a baseline regardless of the feature gate.

2. **No explicit instruction about tool step budget.** The agent has `stepCountIs(6)` (5 tool steps) and 5+ search tools. The prompt doesn't tell the LLM how to budget these. A cross-domain query could exhaust all steps on searches, leaving nothing for document creation if requested in the same turn.

3. **The "never fabricate citations" rule appears once.** Given that hallucinated citations are the highest-risk failure mode for a clinical tool, this could be reinforced with an example of what a fabricated citation looks like.

4. **Missing: out-of-scope handling.** The prompt handles low-confidence KB results well but doesn't address questions entirely outside the platform's domain.

### Proposed Improvement

Add query formulation guidance after the search-first exceptions:

```
**Query formulation:**
When constructing search queries, translate the therapist's situational language into
clinical terminology. If they describe a client behaviour ("keeps going quiet", "agreed
with everything I said"), consider what clinical concept that maps to ("therapeutic
rupture", "withdrawal", "compliance") and search for the concept. If initial results
are poor, reformulate using alternative clinical terms before concluding the KB lacks
relevant content.
```

**Justification:** Provides a baseline vocabulary-mapping instruction when the query reformulation feature gate is disabled, and primes the LLM to think about this at the prompt level.

---

## 2. orientationDescriptions

**File:** `lib/ai/prompts.ts`
**Purpose:** A `Record<TherapeuticOrientation, string>` containing framework-specific prompts injected when the therapist selects a non-integrative orientation. Now covers 8 orientations: integrative, person-centred, CBT, psychodynamic, systemic, existential, MCT, and ACT.

### Review

**Change since last review:** MCT (Metacognitive Therapy) and ACT (Acceptance and Commitment Therapy) have been added. The MCT entry appropriately references CAS (Cognitive Attentional Syndrome) and the distinction between object-level cognition and metacognition. The ACT entry lists all six core processes of the hexaflex.

**Remaining weaknesses:**

1. **Integrative description is dead code.** `getOrientationPrompt` returns empty string for integrative.
2. **No cross-framework exclusion.** The descriptions tell the LLM what to ground reflections *in* but not what to *avoid*. A person-centred therapist wouldn't expect CBT-style thought-challenging questions.
3. **No fluency assumption.** A therapist who selects "psychodynamic" already knows what transference means.

### Proposed Improvement

Add exclusion and fluency clauses to each non-integrative description. Example for person-centred:

```
"Ground reflections in Rogerian principles: empathy, congruence, unconditional positive
regard. [...] Avoid framing reflections through cognitive-behavioural, psychodynamic,
or other frameworks unless the therapist explicitly invites cross-framework thinking.
Assume the therapist is fluent in the concepts of their chosen modality."
```

---

## 3. getToolContextPrompt

**File:** `lib/ai/prompts.ts`
**Purpose:** Dynamically builds a "Search Tool Context" section telling the LLM which modality/jurisdiction filters to apply. Now includes `searchClinicalPractice` guidance.

### Review

**Strengths:** Null-jurisdiction guardrail, clear `searchClinicalPractice` differentiation, cross-domain query guidance.

**Remaining weaknesses:**
1. **Rigid modality filter** could miss content when a therapist asks about a cross-modality technique.
2. **No mention of `searchKnowledgeBase`** (the base fallback tool).

### Proposed Improvement

Soften modality filtering: "include modality by default, but omit the filter if the therapist is asking about a technique from a different modality." Add base tool fallback note.

---

## 4. getRequestPromptFromHints

**File:** `lib/ai/prompts.ts`
**Purpose:** Injects the user's geolocation into the system prompt from Vercel request headers.

### Review — UNCHANGED

**This remains a direct copy from the Vercel AI chatbot template with no clinical relevance.** Injecting precise coordinates into the LLM context for a mental health platform is unnecessary data exposure given the GDPR positioning. Jurisdiction is already handled through the therapist profile.

### Proposed Improvement

Remove entirely or reduce to country only as a soft fallback.

---

## 5. artifactsPrompt

**File:** `lib/ai/prompts.ts`
**Purpose:** Guides the LLM on when and how to use `createDocument` and `updateDocument` tools.

### Review

**Change since last review:** The `requestSuggestions` section has been removed, matching the tool's deletion.

**Remaining weaknesses:**
1. **Still entirely generic — no clinical context.** Doesn't suggest clinical document types (CPD reflective accounts, supervision preparation notes).
2. **No content style guidance** — doesn't tell the agent about UK English, anonymisation, or observational language for documents.
3. **With the new clinical documents system (section 13), the role of this artifact system is increasingly unclear.** The clinical documents route produces structured, spec-driven clinical documents. The artifact system produces generic markdown. The overlap should be clarified.

### Proposed Improvement

Add clinical examples, content guidelines, and clarify the relationship with clinical documents.

---

## 6. titlePrompt

**File:** `lib/ai/prompts.ts`
**Purpose:** Generates a 2–5 word chat title.

### Review — UNCHANGED

**Remaining weaknesses:** "Summarizing" uses US English. No explicit UK English instruction.

### Proposed Improvement

Fix to "summarising". Add UK English instruction.

---

## 7. onCreateDocument — Artifact Creation System Prompt

**File:** `artifacts/text/server.ts`
**Purpose:** System prompt for the LLM call that generates artifact document content.

### Current Prompt — UNCHANGED

```
"Write about the given topic. Markdown is supported. Use headings wherever appropriate."
```

### Review

**This remains the weakest prompt in the codebase** — a direct, unmodified copy from the Vercel AI chatbot template with zero clinical adaptation. No clinical context, no conversation history access, no KB access, no UK English, no anonymisation.

**Context note:** The impact is now partially mitigated by the new clinical documents system (section 13), but this artifact system is still triggered from within the chat interface and therapists will encounter it.

### Proposed Improvement

Replace with a clinically-aware system prompt. Long-term, pass conversation history to the handler.

---

## 8. updateDocumentPrompt

**File:** `lib/ai/prompts.ts`
**Purpose:** System prompt for the LLM call that rewrites an existing document.

### Current Prompt — UNCHANGED

```
"Improve the following contents of the document based on the given prompt.\n\n{currentContent}"
```

### Review — UNCHANGED

No clinical context, "improve" is vague, no instruction to preserve clinical accuracy.

### Proposed Improvement

Replace with a clinically-aware prompt with preservation guardrails.

---

## 9. Sensitive Content Instructions

**File:** `lib/ai/sensitive-content.ts`
**Purpose:** Behavioural directives for safeguarding, suicidal ideation, and therapist distress.

### Review — UNCHANGED

**Strengths:** Specific numbered instructions, enforced verbatim safety statements, appropriate auto-search queries.

**Remaining weaknesses:**
1. UK-only legislation references served to all jurisdictions.
2. "Risk assessment" keyword creates false positives for professional development queries.
3. "Speak with their GP" is UK-centric.
4. No false-positive softening mechanism.

### Proposed Improvement

Add jurisdiction-awareness and false-positive softening instructions.

---

## 10. buildSystemPrompt (Notes) — Clinical Note Generation

**File:** `app/api/notes/generate/route.ts`
**Purpose:** Assembles the system prompt for generating session notes from transcripts.

### Review — UNCHANGED

**Remaining weaknesses:**
1. Transcript embedded in system prompt (should be in user message).
2. No instruction for inaudible/low-confidence segments.
3. 300–600 word target may be too short for complex sessions.
4. No tense consistency instruction.

---

## 11. FORMAT_INSTRUCTIONS

**File:** `app/api/notes/generate/route.ts`

### Review — UNCHANGED

Progress and freeform use identical text. SOAP Objective references "non-verbal cues" which audio-only transcripts can't capture.

---

## 12. SUMMARY_FORMAT_INSTRUCTIONS

**File:** `app/api/notes/generate/route.ts`

### Review — UNCHANGED

Correctly shifts attribution to reported speech. Good clinical transparency.

---

## 13. buildSystemPrompt (Documents) — Clinical Document Generation *(NEW)*

**File:** `app/api/documents/generate/route.ts`
**Purpose:** Assembles the system prompt for generating clinical documents (comprehensive assessments, case formulations, risk assessments, risk & safety plans, treatment plans, supervision notes, discharge summaries) from aggregated client data. This is a wholly new system that did not exist at the time of the first review.

### Review

This is a well-designed, properly clinical system prompt — a dramatic contrast to the artifact creation prompt (section 7). It is structurally the best prompt in the codebase for clinical document generation.

**Strengths:**

- **Proper clinical rules:** UK English, anonymisation, observational language, risk highlighting, and — critically — the instruction "Base the document ONLY on the data provided below. Do not infer or add clinical observations not supported by the source material. If insufficient data exists for a section, state 'Insufficient data available — to be completed by therapist' rather than fabricating content."
- **Config-driven section structure.** The prompt dynamically lists the required and optional sections from the `DocumentTypeConfig`, with descriptions.
- **Spec file injection.** The detailed markdown specification for each document type (see section 14) is injected. This provides rich, per-type clinical guidance.
- **Context assembly.** `assembleDocumentContext` builds structured data blocks from client records, session history, clinical notes, and prior documents.
- **Sufficiency gating.** The route checks data sufficiency before making any LLM calls.
- **RAG tool access.** Knowledge search tools are available for grounding.
- **Word count guidance per document type.**

**Weaknesses:**

1. **No explicit tense instruction.** Clinical documents should generally use past tense for historical content and present tense for current formulations. The spec files handle this implicitly for some types but not consistently.

2. **The "Do NOT diagnose" rule may be too restrictive for some document types.** Case formulations and comprehensive assessments commonly include diagnostic impressions (e.g. "Presentation consistent with moderate depressive episode"). The blanket rule could force the LLM to omit important formulation language. The spec files partially override this with more nuanced instructions, but the top-level rule may cause confusion about which instruction takes precedence.

3. **No instruction about handling contradictory source data.** When clinical notes from different sessions contain conflicting observations, the prompt doesn't guide the LLM on how to reconcile or flag contradictions.

4. **`additionalInstructions` appended at the end** may fall in a low-attention zone for long prompts.

### Proposed Improvement

Soften the diagnostic language rule:

```
"- Do NOT provide formal diagnoses (e.g. ICD-11 or DSM-5 codes) unless the source data
  explicitly includes them. You MAY use clinical formulation language (e.g. 'presentation
  consistent with...', 'features suggestive of...') when the source data supports it."
```

Add contradictory data handling:

```
"- If the source data contains contradictory observations across sessions (e.g. risk
  level described differently), document both perspectives with dates and note the
  discrepancy. Do not silently resolve contradictions by choosing one version."
```

---

## 14. Document Specification Files — Per-Type Generation Specs *(NEW)*

**Files:** `lib/documents/specs/` — 7 markdown files: `comprehensive-assessment.md`, `case-formulation.md`, `risk-assessment.md`, `risk-safety-plan.md`, `treatment-plan.md`, `supervision-notes.md`, `discharge-summary.md`

**Purpose:** Detailed per-type specifications injected into the clinical document generation system prompt. Each file provides document-specific instructions, section-by-section guidance, clinical context, and regulatory references.

### Review

**These are the highest-quality prompt instructions in the entire codebase.** They read as though authored by someone with genuine clinical expertise and understanding of professional documentation standards.

**Strengths:**

- **Clinically precise.** The risk assessment spec distinguishes between static and dynamic risk factors, chronic and acute risk, and specifies exactly what to document for suicidal ideation (frequency, duration, intensity, specificity, access to means, degree of intent).
- **Jurisdiction-aware.** Specs reference UK legislation (Children Act 1989/2004, Care Act 2014, Mental Health Act 1983) and Irish equivalents (Children First Act 2015, IACP Code of Ethics).
- **Anti-boilerplate.** The risk assessment spec: "Do not write 'low risk' or 'no risk identified' without specifying what was explored, what the client reported, and what clinical observations support the conclusion."
- **Audit-awareness.** The supervision notes spec notes documents "may be subject to audit, legal discovery, or professional body review following a serious incident."
- **Voice distinction.** The supervision notes spec: "Clearly distinguish between three voices: what the supervisee reported, what the supervisor advised, and what was mutually agreed."
- **Proportionate word counts** per document type.

**Weaknesses:**

1. **No versioning or review date.** These encode clinical standards that may change. No mechanism to track when they were last reviewed by the clinical collaborator.
2. **Some UK-centric assumptions** that may not apply to EU therapists beyond Ireland.
3. **The case formulation spec prescribes the "5 Ps" framework.** While widely used, a psychodynamic therapist might prefer a different formulation model.

### Proposed Improvement

Add a review metadata comment to each spec:

```markdown
<!-- Last clinical review: [date] | Reviewer: [Aaron] | Next review due: [date] -->
```

---

## 15. Session Context Prompt — Transcript Injection *(NEW)*

**File:** `app/(chat)/api/chat/route.ts` (lines ~162–198)
**Purpose:** When a chat is linked to a therapy session with a completed transcription, a truncated session transcript is injected into the system prompt so the agent can reflect on the session content.

### Current Prompt

```
## Session Context
The therapist is reflecting on a session from {date} ({duration}) with {clientLabel}.
Here is a summary of the session transcript:

{truncated transcript lines in [speaker]: content format}
```

### Review

**Strengths:**
- Truncation to ~2,000 characters prevents token bloat.
- Clear `[transcript truncated]` marker.
- Speaker labels preserved.
- Session date and duration provide temporal context.

**Weaknesses:**

1. **Client name may be leaked.** The code uses `client?.name ?? "their client"` — if the client record has a name, it is injected into the system prompt. This directly conflicts with the main prompt's privacy instructions. **This is a P1 issue.**

2. **Truncation is character-based, not semantically-aware.** Cuts mid-conversation at a 2,000-character boundary, potentially splitting a clinically significant exchange.

3. **No framing instruction.** The transcript is provided but the agent isn't told *how* to use it — should it proactively reference the session? Should it treat the transcript as quotable?

### Proposed Improvement

Always anonymise:

```typescript
const clientLabel = "their client"; // Never inject client names into the prompt
```

Add framing:

```
Here is a summary of the session transcript. Use this to inform your reflections when
the therapist asks about this session. Do not quote the transcript verbatim — instead,
reference themes and moments to support your reflective questions.
```

---

## 16. Query Reformulation Prompt — Multi-Query Retrieval *(NEW)*

**File:** `lib/ai/query-reformulation.ts`
**Purpose:** Generates 3 clinical terminology reformulations of the therapist's search query. Uses GPT-4o-mini. Feature-gated behind `ENABLE_QUERY_REFORMULATION=true`.

### Review

**Strengths:**
- Correctly frames the KB contents (legislation, guidelines, therapeutic frameworks, clinical practice).
- Category and modality context included when available.
- Few-shot examples are excellent ("client went quiet" → "therapeutic rupture withdrawal metacommunication").
- Graceful degradation on failure.

**Weaknesses:**

1. **Temperature 0.3 may produce insufficiently diverse reformulations.** The point of multi-query retrieval is to cast a wider net. Consider 0.5–0.7 for more diversity.

2. **Fixed count of exactly 3.** For simple queries, this adds latency with little benefit.

3. **No intent preservation instruction.** "Client keeps cancelling" could be reformulated as "administrative non-attendance policy" which changes the intent from therapeutic concern to logistics.

### Proposed Improvement

Add:

```
"Each reformulation must preserve the clinical intent of the original query. A therapist
asking about a client's behaviour is seeking therapeutic understanding, not administrative
guidance. Reformulate the vocabulary, not the intent."
```

---

## 17. Faithfulness Check Prompt — Post-Generation Auditor *(NEW)*

**File:** `lib/ai/faithfulness-check.ts`
**Purpose:** Post-generation faithfulness verification. Evaluates whether the agent's response is grounded in retrieved KB chunks. Runs asynchronously — never blocks the response. Feature-gated behind `ENABLE_FAITHFULNESS_CHECK=true`.

### Review

**Strengths:**
- Correct scope: evaluates factual claims only, not reflective questions.
- Clear "supported" vs "unsupported" definitions.
- Structured output via Zod with per-claim verdicts.
- 0.7 threshold is reasonable.
- Fire-and-forget architecture — zero latency impact.

**Weaknesses:**

1. **No handling for `general_knowledge` strategy responses.** When the CRAG router selects `general_knowledge`, the agent responds from training knowledge. The faithfulness checker would flag these as unsupported because there are no source chunks to match. The check should skip or differentiate these responses.

2. **No citation verification.** The agent is instructed to cite sources formally. The checker should verify that cited document titles match actual retrieved chunks, catching hallucinated citations.

3. **No paraphrasing accuracy check.** A claim could be "supported" by topic match while the LLM's paraphrase introduces subtle inaccuracies.

### Proposed Improvement

Add `general_knowledge` exclusion and citation checking:

```
"If the AI response explicitly indicates it is drawing on general clinical knowledge
rather than the knowledge base, exclude those claims from evaluation.

For any bracketed citations (e.g. [Source: Document Title]), verify that the cited
title matches one of the source chunks provided. Flag any citation that references a
document not in the sources."
```

---

## 18. Claude Diarization — Speaker Labelling Prompt

**File:** `lib/transcription/providers/claude-diarization.ts`

### Review — UNCHANGED

**Remaining weaknesses:** No ambiguity handling for minimal utterances, no overlapping speech handling, behavioural cues biased toward CBT-style therapy, no few-shot examples.

### Proposed Improvement

Add ambiguity guidance, modality-aware caveat, and a brief labelling example.

---

## 19. Whisper Domain Prompt — Vocabulary Hint

**File:** `lib/transcription/providers/whisper-api.ts`

### Review — UNCHANGED

**Remaining weaknesses:** Narrow vocabulary (8 terms), no modality adaptation, UK English not reinforced.

### Proposed Improvement

Expand vocabulary and make modality-aware.

---

## 20. Contextual Enrichment — System Prompt

**File:** `scripts/lib/contextual-enrichment.ts`

### Review — UNCHANGED

Generic role description with no clinical domain awareness.

### Proposed Improvement

Replace with clinically-aware system prompt.

---

## 21. buildEnrichmentPrompt — Chunk Context Generation

**File:** `scripts/lib/contextual-enrichment.ts`

### Review — UNCHANGED

Situational vocabulary instructions (point 3) are already present. Remaining weaknesses: no conservative pronoun resolution, no self-contained chunk guidance.

---

## 22. Removed: requestSuggestions *(REMOVED)*

**File:** Previously `lib/ai/tools/request-suggestions.ts` — **now deleted**

The `requestSuggestions` tool and its associated prompt have been removed from the codebase. The tool file no longer exists and the agent no longer registers it. The `artifactsPrompt` no longer references it.

**Note:** The UI component `components/document.tsx` still contains type/action references to `request-suggestions` but there is no backing tool. This is dead UI code that should be cleaned up.

---

## 23. Summary of Priorities

### Critical (affects clinical safety or core functionality)

| # | Prompt | Issue | Priority |
|---|--------|-------|----------|
| 7 | onCreateDocument | Completely generic, no clinical context — produces unusable content | **P0** |
| 8 | updateDocumentPrompt | No clinical preservation guardrails — may degrade clinical content | **P0** |
| 15 | Session context prompt | Client name leaked into system prompt — conflicts with privacy rules | **P1** |
| 4 | getRequestPromptFromHints | Unnecessary precise geolocation in clinical platform context | **P1** |
| 9 | Sensitive content | UK-only legislation references served to all jurisdictions | **P1** |

### High (measurably improves agent quality)

| # | Prompt | Issue | Priority |
|---|--------|-------|----------|
| 1 | therapyReflectionPrompt | No prompt-level query translation guidance (partially mitigated by reformulation module) | **P2** |
| 17 | Faithfulness check | Doesn't handle `general_knowledge` responses — would flag them as unfaithful | **P2** |
| 19 | Whisper domain prompt | Narrow vocabulary list, no modality adaptation | **P2** |
| 18 | Claude diarization | No ambiguity handling, no examples, modality-biased cues | **P2** |
| 10 | buildSystemPrompt (notes) | Transcript in system prompt, no tense/uncertainty handling | **P2** |
| 20 | Enrichment system prompt | Generic role, no clinical domain awareness | **P2** |

### Medium (polish, consistency, and future-proofing)

| # | Prompt | Issue | Priority |
|---|--------|-------|----------|
| 13 | buildSystemPrompt (documents) | "Do NOT diagnose" may be too restrictive for formulations; no contradictory data handling | **P3** |
| 14 | Document specs | No versioning/review dates; some UK-centric assumptions | **P3** |
| 16 | Query reformulation | Temperature may be too low; no intent preservation instruction | **P3** |
| 2 | orientationDescriptions | No cross-framework exclusion, no fluency assumption | **P3** |
| 3 | getToolContextPrompt | Rigid modality filtering, no base tool fallback | **P3** |
| 5 | artifactsPrompt | Generic examples, unclear relationship with clinical documents system | **P3** |
| 6 | titlePrompt | US English in prompt text | **P3** |
| 11 | FORMAT_INSTRUCTIONS | Duplicate progress/freeform, non-verbal cue assumption | **P3** |
| 22 | requestSuggestions (dead UI) | UI references deleted tool — dead code cleanup | **P4** |