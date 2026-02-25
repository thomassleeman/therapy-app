# RAG Grounding Prompt Tests — Results & Analysis

**Date:** 2026-02-25
**Purpose:** Verify that the therapy reflection agent is answering from retrieved knowledge-base content rather than from the LLM's general training data.
**Knowledge base tested against:** 20 CBT documents authored by a Senior Clinical Psychologist, stored in `/knowledge-base/therapeutic-content/cbt/`

---

## Test Results Summary

| Test | Topic | Distinctive Marker Tested | Result | Notes |
|---|---|---|---|---|
| 1 | Graded Exposure | "Rule of Three"; "cognitive bypasses"; 50% SUDs threshold | **Borderline Pass** | Specific numbers retrieved; authored labels paraphrased away |
| 2 | Downward Arrow | "The thud" as clinical marker; "horizontal questioning" | **Pass** | Primary marker retrieved and used correctly |
| 3 | Risk & Safety Planning | "Safety via stabilisation"; "canaries in the coal mine" | **Marginal Pass** | Distinctive phrase present but model disclaimed retrieval |
| 4 | Core Beliefs / Schema Work | "Head Rating" vs "Heart Rating"; "Evidence Jar" | **Fail** | Model answered from psychodynamic framework — wrong modality entirely |
| 5 | Therapeutic Alliance / Rupture | "Doing mode" / "being mode"; "therapeutic drift" | **Fail** | No rupture theory surfaced; model deflected with Socratic questions |

---

## Individual Test Detail

### Test 1 — Graded Exposure: "Rule of Three"

**Query:** "I'm planning graded exposure with a client who has agoraphobia. What are the key principles I need to follow to make each exposure session therapeutically effective?"

**Source document:** `Graded-Exposure-and-Habituation.md`

**Distinctive markers:**
- "Rule of Three" — the named label for the three-part implementation framework
- "Cognitive bypasses" — the author's specific term for safety behaviours
- 50% SUDs reduction threshold for defining "prolonged" exposure

**Response behaviour:** The 50% threshold and exact SUDs tier ranges (20–40, 50–70, 80–100) were reproduced correctly, indicating the document was retrieved. However, "Rule of Three" was not named — the three components appeared under a generic subheading — and "cognitive bypasses" was replaced with the generic "safety behaviours."

**Conclusion:** Retrieval fired but the LLM paraphrased authored terminology into standard CBT vocabulary. Numbers came through; labels did not.

---

### Test 2 — Downward Arrow: "The Thud"

**Query:** "When I'm using the Downward Arrow technique, how do I know I've actually reached a core belief rather than just another automatic thought?"

**Source document:** `The-Downward-Arrow-Technique.md`

**Distinctive markers:**
- "Identifying the thud" — named clinical signal for reaching a core belief
- "Shift in the room" — accompanying language
- "Horizontal questioning" — named pitfall (questions that generate more automatic thoughts rather than deeper meaning)

**Response behaviour:** "The thud" was explicitly named and paired with "shift in the room" — both phrases from the document. "Horizontal questioning" was absent. The response also included a self-referential line ("The retrieved content mentions..."), explicitly flagging that retrieval had occurred.

**Conclusion:** Clear pass. Primary distinctive marker retrieved and faithfully reproduced. The self-referential narration of retrieval is a prompt engineering issue — the model should not describe its own retrieval process to the user.

---

### Test 3 — Risk & Safety Planning

**Query:** "How do you approach safety planning differently from a standard risk assessment, and what's your overall philosophy for it in a CBT context?"

**Source document:** `Risk-Assessment-and-Safety-Planning.md`

**Distinctive markers:**
- "Safety via stabilisation rather than safety via restriction" — core framing statement
- "Canaries in the coal mine" — metaphor for warning signs
- Explicit critique of no-harm contracts as having "little evidence base"
- "Environmental engineering" — term for means restriction

**Response behaviour:** "Safety via stabilisation" appeared and was quoted. The five-step safety plan structure was reproduced in the correct order. However, the "canaries in the coal mine" metaphor was absent (replaced with generic "warning signs"), no-harm contract critique was absent, and "environmental engineering" was paraphrased as "making the environment safer." Critically, the response opened with "The searches did not return specific guidance" — then immediately used a document-specific phrase, suggesting a confidence threshold or scoring issue.

**Conclusion:** Marginal pass on the primary criterion. The more significant finding is the mismatch between the model disclaiming retrieval and simultaneously using retrieved content. This points to a confidence calibration problem in the pipeline — the retrieval score fell near or below threshold but content was partially injected anyway.

---

### Test 4 — Core Beliefs / Schema Work

**Query:** "My client intellectually agrees that they're not a failure, but still feels like one emotionally. How do I work with that gap in schema-level work?"

**Source document:** `Working-with-Core-Beliefs-and-Schema.md`

**Distinctive markers:**
- "Head Rating" vs "Heart Rating" — named distinction for intellectual vs emotional belief
- "Evidence Jar" — alternative name for Positive Data Log
- "Building a new case in the court of their mind" — metaphor for PDL rationale

**Response behaviour:** The response contained none of the distinctive markers. It answered from a psychodynamic framework — using terms like "unconscious emotional processing," "transference," "countertransference," and "affective schemas." No CBT content was present.

**Conclusion:** Hard fail. Retrieval did not fire (or retrieved content was entirely overridden by prior training data). The psychodynamic framing suggests the query's abstract phrasing ("the gap between knowing and feeling") did not semantically match the schema document's embeddings well enough to surface it. Technique-agnostic emotional vocabulary is a retrieval gap.

---

### Test 5 — Therapeutic Alliance / Rupture Repair

**Query:** "Halfway through a session focused on exposure planning, my client went quiet and gave short answers. I wasn't sure what was happening. How should I have handled that?"

**Source document:** `The-Therapeutic-Alliance-and-Rupture.md`

**Distinctive markers:**
- "Withdrawal rupture" — named category
- "Doing mode" to "being mode" — framing for the repair response
- "Therapeutic drift" — named consequence of ignoring a rupture
- Metacommunication as the specific technique

**Response behaviour:** The response contained none of the distinctive markers. The agent asked the therapist to state their therapeutic orientation, then after being told "CBT," deflected with a Socratic question about the therapist's own internal reaction. No rupture theory was introduced. The reflective, question-based tone felt clinically appropriate but was entirely ungrounded in the knowledge base.

**Conclusion:** Fail. This is the harder failure mode to detect in practice — the response *feels* like the tool is working (reflexive, curious, non-directive) while providing no grounded clinical content. The symptom description (client going quiet mid-session) may not have semantically matched "rupture repair" in the document embeddings.

---

## Cross-Test Analysis

### What consistently worked
- **Technique-named queries** (Tests 1 and 2) retrieved reliably. Queries that included or directly implied a named CBT technique ("Downward Arrow," "graded exposure") returned relevant chunks.
- **Specific numbers** came through faithfully even when labels were paraphrased (50% SUDs threshold, SUDs tier ranges).

### What consistently failed
- **Abstract or emotionally-described queries** (Tests 4 and 5) did not retrieve. Queries describing a clinical situation without naming a technique rely on semantic similarity to match the right document — and that matching is currently unreliable.
- **Authored labels and metaphors** were routinely paraphrased into standard CBT terminology even when the document was retrieved. "Cognitive bypasses" → "safety behaviours"; "canaries in the coal mine" → "warning signs"; "Rule of Three" → unlabelled list.

### Distinct failure modes identified

| Mode | Tests | Description |
|---|---|---|
| **Paraphrasing retrieved content** | 1, 3 | Document retrieved but LLM smooths authored language into generic clinical vocabulary |
| **Clean retrieval failure** | 4 | No relevant document retrieved; model answers from prior training (wrong modality in Test 4) |
| **Reflective deflection masking failure** | 5 | No retrieval; Socratic default behaviour makes the absence of grounded content hard to detect |
| **Confidence miscalibration** | 3 | Low-confidence retrieval causes model to disclaim retrieval while still using retrieved content |

---

## Recommendations

### 1. System prompt: instruct the LLM to use document language
Add an explicit instruction along the lines of: *"Where you have retrieved source material, use the specific terminology and framings from that material rather than paraphrasing into generic clinical language."* This should recover the paraphrasing failures (Tests 1 and 3).

### 2. Retrieval: improve coverage for symptom-described queries
Tests 4 and 5 failed because the queries described situations rather than naming techniques. Options:
- Add semantic metadata or descriptive tags to document chunks (e.g., "client goes quiet," "intellectual-emotional belief gap")
- Consider a query expansion step that maps common clinical situations to technique names before running the vector search
- Add a few-shot retrieval routing layer for high-frequency situation types

### 3. Confidence thresholds: fix the self-reporting inconsistency (Test 3)
The model should not disclaim retrieval while simultaneously using retrieved content. Either:
- Raise the threshold so below-threshold content is not injected at all, or
- Ensure the model's confidence language reflects the actual retrieval score

### 4. Test 5 failure mode is the highest-risk in production
A response that *feels* clinically thoughtful but contains zero grounded content is harder for a therapist to identify as a failure than a confidently wrong response (Test 4). Consider adding a UI indicator when retrieval confidence is low or no sources were returned, so the therapist knows when the response is ungrounded.

---

## Reusable Test Queries

These queries can be re-run after pipeline changes to track improvement:

1. **Exposure (technique-named):** "I'm planning graded exposure for agoraphobia. What are the key principles to make each session therapeutically effective?" — *Look for: "Rule of Three," "cognitive bypasses," 50% threshold*

2. **Downward Arrow (technique-named):** "When using the Downward Arrow, how do I know I've reached a core belief?" — *Look for: "the thud," "horizontal questioning"*

3. **Risk (philosophy-based):** "How do you approach safety planning differently from risk assessment in CBT?" — *Look for: "safety via stabilisation," "canaries in the coal mine," no-harm contract critique*

4. **Schema (situation-described, abstract):** "My client intellectually agrees they're not a failure but still feels like one. How do I work with that gap?" — *Look for: "Head Rating"/"Heart Rating," "Evidence Jar"*

5. **Rupture (situation-described, no technique name):** "My client went quiet mid-session during exposure planning. How should I have handled that?" — *Look for: "withdrawal rupture," "doing mode"/"being mode," "therapeutic drift"*
