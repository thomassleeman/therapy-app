// lib/ai/__tests__/sensitive-content.test.ts

import { describe, expect, it } from "vitest";
import {
  detectSensitiveContent,
  type SensitiveCategory,
  type SensitiveContentDetection,
} from "../sensitive-content";

// ── Helpers ───────────────────────────────────────────────────────────────

function expectCategories(
  result: SensitiveContentDetection,
  expected: SensitiveCategory[]
) {
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper called from within test callbacks
  expect(result.detectedCategories.sort()).toEqual(expected.sort());
}

function expectNoDetection(result: SensitiveContentDetection) {
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper called from within test callbacks
  expect(result.detectedCategories).toEqual([]);
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper called from within test callbacks
  expect(result.additionalInstructions).toBe("");
  // biome-ignore lint/suspicious/noMisplacedAssertion: helper called from within test callbacks
  expect(result.autoSearchQueries).toEqual([]);
}

// ── Empty / benign input ──────────────────────────────────────────────────

describe("detectSensitiveContent", () => {
  describe("no detection for benign input", () => {
    it("returns empty for empty string", () => {
      expectNoDetection(detectSensitiveContent(""));
    });

    it("returns empty for whitespace-only", () => {
      expectNoDetection(detectSensitiveContent("   \n\t  "));
    });

    it("returns empty for a typical clinical question", () => {
      expectNoDetection(
        detectSensitiveContent(
          "My client is presenting with generalised anxiety. What CBT techniques would be most appropriate for the formulation stage?"
        )
      );
    });

    it("returns empty for general therapy discussion", () => {
      expectNoDetection(
        detectSensitiveContent(
          "I'd like to explore person-centred approaches for building the therapeutic alliance with this client."
        )
      );
    });
  });

  // ── Safeguarding ──────────────────────────────────────────────────────

  describe("safeguarding detection", () => {
    it("detects 'safeguarding' keyword", () => {
      const result = detectSensitiveContent(
        "I have a safeguarding concern about this client's child."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'child protection' phrase", () => {
      const result = detectSensitiveContent(
        "The client mentioned child protection services have been involved."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'disclosure' keyword", () => {
      const result = detectSensitiveContent(
        "My client made a disclosure in today's session about their childhood."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'abuse' keyword", () => {
      const result = detectSensitiveContent(
        "The client described what sounds like emotional abuse from their partner."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'neglect' keyword", () => {
      const result = detectSensitiveContent(
        "There are signs of neglect in the home environment."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'harm to children' phrase", () => {
      const result = detectSensitiveContent(
        "I'm worried about potential harm to children in the household."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'duty to report' phrase", () => {
      const result = detectSensitiveContent(
        "Do I have a duty to report what my client told me?"
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'vulnerable adult' phrase", () => {
      const result = detectSensitiveContent(
        "My client may be a vulnerable adult at risk of financial exploitation."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'domestic violence' phrase", () => {
      const result = detectSensitiveContent(
        "The client disclosed domestic violence at home."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'modern slavery' phrase", () => {
      const result = detectSensitiveContent(
        "I suspect my client may be a victim of modern slavery."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("includes statutory obligation instructions", () => {
      const result = detectSensitiveContent("There are safeguarding concerns.");
      expect(result.additionalInstructions).toContain(
        "Safeguarding responsibilities take precedence over confidentiality"
      );
      expect(result.additionalInstructions).toContain("Children Act 2004");
      expect(result.additionalInstructions).toContain("Care Act 2014");
    });

    it("auto-triggers legislation search for Children Act and Care Act", () => {
      const result = detectSensitiveContent("I have a safeguarding concern.");
      const queries = result.autoSearchQueries;
      expect(queries).toHaveLength(2);
      expect(queries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: "searchLegislation",
            query: expect.stringContaining("Children Act 2004"),
          }),
          expect.objectContaining({
            tool: "searchLegislation",
            query: expect.stringContaining("Care Act 2014"),
          }),
        ])
      );
    });

    it("detects 'children act' phrase reference", () => {
      const result = detectSensitiveContent(
        "What does the Children Act say about my obligations here?"
      );
      expectCategories(result, ["safeguarding"]);
    });
  });

  // ── Suicidal ideation / self-harm ─────────────────────────────────────

  describe("suicidal ideation detection", () => {
    it("detects 'suicidal' keyword", () => {
      const result = detectSensitiveContent(
        "My client expressed suicidal thoughts in our last session."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'self-harm' keyword", () => {
      const result = detectSensitiveContent(
        "The client has a history of self-harm."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'wants to end their life' phrase", () => {
      const result = detectSensitiveContent(
        "My client said they wants to end their life."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'client mentioned dying' phrase", () => {
      const result = detectSensitiveContent(
        "The client mentioned dying during our session today."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'risk assessment' phrase", () => {
      const result = detectSensitiveContent(
        "I need to complete a risk assessment for this client."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'suicide' keyword", () => {
      const result = detectSensitiveContent(
        "The client's friend completed suicide last month and they are really affected."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'overdose' keyword", () => {
      const result = detectSensitiveContent(
        "The client was hospitalised for an overdose last week."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'safety plan' phrase", () => {
      const result = detectSensitiveContent(
        "Should I create a safety plan with this client?"
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects 'not wanting to be here' phrase", () => {
      const result = detectSensitiveContent(
        "The client keeps saying they're not wanting to be here anymore."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("includes risk protocol instruction", () => {
      const result = detectSensitiveContent("My client is suicidal.");
      expect(result.additionalInstructions).toContain(
        "Risk assessment is a clinical responsibility"
      );
      expect(result.additionalInstructions).toContain(
        "follow your service's risk protocol"
      );
    });

    it("includes NEVER assess risk instruction", () => {
      const result = detectSensitiveContent("Client mentioned self-harm.");
      expect(result.additionalInstructions).toContain(
        "NEVER attempt to assess the client's risk level"
      );
    });

    it("auto-triggers guidelines search for risk assessment frameworks", () => {
      const result = detectSensitiveContent("The client is suicidal.");
      const queries = result.autoSearchQueries;
      expect(queries.length).toBeGreaterThanOrEqual(1);
      expect(queries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: "searchGuidelines",
            query: expect.stringContaining("risk assessment"),
          }),
        ])
      );
    });
  });

  // ── Therapist distress ────────────────────────────────────────────────

  describe("therapist distress detection", () => {
    it("detects 'I'm struggling' phrase", () => {
      const result = detectSensitiveContent(
        "I'm struggling with this particular case."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'burnt out' keyword", () => {
      const result = detectSensitiveContent(
        "I feel completely burnt out after this week."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'burnout' keyword", () => {
      const result = detectSensitiveContent(
        "I think I'm experiencing burnout."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'can't cope' phrase", () => {
      const result = detectSensitiveContent(
        "I can't cope with the emotional weight of my caseload."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'vicarious trauma' phrase", () => {
      const result = detectSensitiveContent(
        "I think I'm experiencing vicarious trauma from my trauma caseload."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'compassion fatigue' phrase", () => {
      const result = detectSensitiveContent(
        "I've been reading about compassion fatigue and I think it applies to me."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'emotionally exhausted' phrase", () => {
      const result = detectSensitiveContent(
        "I'm emotionally exhausted after today's sessions."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'dreading sessions' phrase", () => {
      const result = detectSensitiveContent(
        "I've started dreading sessions with this particular client."
      );
      expectCategories(result, ["therapist_distress"]);
    });

    it("detects 'secondary trauma' phrase", () => {
      const result = detectSensitiveContent(
        "I wonder if this is secondary trauma from working with abuse survivors."
      );
      // Should detect both therapist_distress (secondary trauma) and safeguarding (abuse)
      expect(result.detectedCategories).toContain("therapist_distress");
    });

    it("includes validation instruction", () => {
      const result = detectSensitiveContent("I'm struggling with my caseload.");
      expect(result.additionalInstructions).toContain(
        "Validate their experience"
      );
    });

    it("includes do-not-therapise instruction", () => {
      const result = detectSensitiveContent("I feel burnt out.");
      expect(result.additionalInstructions).toContain(
        "Do NOT attempt to provide therapy to the therapist"
      );
    });

    it("suggests supervision", () => {
      const result = detectSensitiveContent("I can't cope anymore.");
      expect(result.additionalInstructions).toContain("supervision");
    });

    it("auto-triggers guidelines search for wellbeing", () => {
      const result = detectSensitiveContent(
        "I'm experiencing compassion fatigue."
      );
      expect(result.autoSearchQueries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: "searchGuidelines",
            query: expect.stringContaining("compassion fatigue"),
          }),
        ])
      );
    });
  });

  // ── Multiple category detection ───────────────────────────────────────

  describe("multiple category detection", () => {
    it("detects safeguarding + suicidal ideation together", () => {
      const result = detectSensitiveContent(
        "My client disclosed abuse and is now expressing suicidal thoughts."
      );
      expectCategories(result, ["safeguarding", "suicidal_ideation"]);
    });

    it("detects all three categories simultaneously", () => {
      const result = detectSensitiveContent(
        "I'm struggling with a case where the client disclosed abuse and is now suicidal."
      );
      expectCategories(result, [
        "safeguarding",
        "suicidal_ideation",
        "therapist_distress",
      ]);
    });

    it("combines instructions from all detected categories", () => {
      const result = detectSensitiveContent(
        "I'm struggling with a safeguarding case and my client is suicidal."
      );
      // Should have instructions from all three
      expect(result.additionalInstructions).toContain("SAFEGUARDING DETECTED");
      expect(result.additionalInstructions).toContain("SUICIDAL IDEATION");
      expect(result.additionalInstructions).toContain("THERAPIST DISTRESS");
    });

    it("combines auto-search queries from all categories", () => {
      const result = detectSensitiveContent(
        "I'm struggling with a safeguarding disclosure about a suicidal client."
      );
      // Should have queries from all three categories
      const tools = result.autoSearchQueries.map((q) => q.tool);
      expect(tools).toContain("searchLegislation");
      expect(tools).toContain("searchGuidelines");
    });

    it("detects therapist distress + suicidal ideation", () => {
      const result = detectSensitiveContent(
        "I can't cope with the pressure of doing risk assessments every day."
      );
      expectCategories(result, ["suicidal_ideation", "therapist_distress"]);
    });
  });

  // ── Case insensitivity ────────────────────────────────────────────────

  describe("case insensitivity", () => {
    it("detects UPPERCASE keywords", () => {
      const result = detectSensitiveContent("SAFEGUARDING CONCERN");
      expectCategories(result, ["safeguarding"]);
    });

    it("detects Mixed Case keywords", () => {
      const result = detectSensitiveContent("My client is Suicidal.");
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects mixed case phrases", () => {
      const result = detectSensitiveContent(
        "Is there a Duty To Report in this situation?"
      );
      expectCategories(result, ["safeguarding"]);
    });
  });

  // ── Whitespace handling ───────────────────────────────────────────────

  describe("whitespace handling", () => {
    it("detects phrases across line breaks", () => {
      const result = detectSensitiveContent(
        "The client talked about\nchild protection\nin our session."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects phrases with extra spaces", () => {
      const result = detectSensitiveContent(
        "I have a  duty  to  report  this?"
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects phrases across tabs", () => {
      const result = detectSensitiveContent("I'm\tstruggling\twith this case.");
      expectCategories(result, ["therapist_distress"]);
    });
  });

  // ── Word boundary matching ────────────────────────────────────────────

  describe("word boundary matching", () => {
    it("detects 'abuse' as a standalone word", () => {
      const result = detectSensitiveContent("The client experienced abuse.");
      expectCategories(result, ["safeguarding"]);
    });

    it("detects 'suicide' at end of sentence", () => {
      const result = detectSensitiveContent(
        "The client's brother died by suicide."
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("detects keyword at start of message", () => {
      const result = detectSensitiveContent(
        "Neglect is suspected in this case."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("detects keyword followed by punctuation", () => {
      const result = detectSensitiveContent("Is this abuse? I'm not sure.");
      expectCategories(result, ["safeguarding"]);
    });
  });

  // ── Return shape ──────────────────────────────────────────────────────

  describe("return shape", () => {
    it("returns correct shape for no detection", () => {
      const result = detectSensitiveContent("Tell me about CBT formulation.");
      expect(result).toEqual({
        detectedCategories: [],
        additionalInstructions: "",
        autoSearchQueries: [],
      });
    });

    it("returns correct shape for single detection", () => {
      const result = detectSensitiveContent("My client is suicidal.");
      expect(result).toHaveProperty("detectedCategories");
      expect(result).toHaveProperty("additionalInstructions");
      expect(result).toHaveProperty("autoSearchQueries");
      expect(Array.isArray(result.detectedCategories)).toBe(true);
      expect(typeof result.additionalInstructions).toBe("string");
      expect(Array.isArray(result.autoSearchQueries)).toBe(true);
    });

    it("auto-search queries have correct shape", () => {
      const result = detectSensitiveContent("Safeguarding concern.");
      for (const query of result.autoSearchQueries) {
        expect(query).toHaveProperty("tool");
        expect(query).toHaveProperty("query");
        expect(typeof query.tool).toBe("string");
        expect(typeof query.query).toBe("string");
      }
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles very long messages", () => {
      const filler = "This is a normal therapy reflection sentence. ".repeat(
        200
      );
      const message = `${filler}The client is suicidal.${filler}`;
      const result = detectSensitiveContent(message);
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("handles messages with special characters", () => {
      const result = detectSensitiveContent(
        "Client's self-harm — should I be concerned?"
      );
      expectCategories(result, ["suicidal_ideation"]);
    });

    it("handles messages with unicode", () => {
      const result = detectSensitiveContent(
        "The client mentioned abuse in today's session — I'm concerned."
      );
      expectCategories(result, ["safeguarding"]);
    });

    it("does not crash on null-ish input", () => {
      // TypeScript wouldn't normally allow this, but defensive coding
      expectNoDetection(detectSensitiveContent(undefined as unknown as string));
      expectNoDetection(detectSensitiveContent(null as unknown as string));
    });
  });

  // ── False positive acceptance ─────────────────────────────────────────

  describe("accepted false positives (by design)", () => {
    it("triggers on academic discussion of abuse theories", () => {
      // This is an accepted false positive — better safe than sorry
      const result = detectSensitiveContent(
        "I'm studying attachment theory and the effects of abuse on development."
      );
      expect(result.detectedCategories).toContain("safeguarding");
    });

    it("triggers on discussion of risk assessment as a concept", () => {
      const result = detectSensitiveContent(
        "Can you explain different risk assessment frameworks?"
      );
      expect(result.detectedCategories).toContain("suicidal_ideation");
    });

    it("triggers on mentioning burnout research", () => {
      const result = detectSensitiveContent(
        "I've been reading research on burnout in the helping professions."
      );
      expect(result.detectedCategories).toContain("therapist_distress");
    });
  });
});
