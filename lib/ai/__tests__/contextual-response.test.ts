/**
 * Tests for buildContextualResponse — Task 4.6
 *
 * Location: lib/ai/__tests__/contextual-response.test.ts
 *
 * Run with: pnpm vitest run lib/ai/__tests__/contextual-response.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  buildContextualResponse,
  type ContextChunk,
  MAX_CONTEXT_CHUNKS,
} from "../contextual-response";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Creates a camelCase chunk (domain tool shape). */
function makeDomainChunk(overrides: Partial<ContextChunk> = {}): ContextChunk {
  return {
    content: "Default chunk content for testing.",
    documentTitle: "Test Document",
    sectionPath: "Section 1.1",
    similarityScore: 0.85,
    documentType: "therapeutic_content",
    modality: "cbt",
    ...overrides,
  };
}

/** Creates a snake_case chunk (base tool shape). */
function makeBaseChunk(overrides: Partial<ContextChunk> = {}): ContextChunk {
  return {
    content: "Default base chunk content for testing.",
    document_title: "Base Test Document",
    section_path: "Section 2.1",
    similarity_score: 0.82,
    document_type: "legislation",
    modality: null,
    ...overrides,
  };
}

// ─── High confidence ────────────────────────────────────────────────────────

describe("buildContextualResponse — high confidence", () => {
  it("wraps chunks in <context><document> XML", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [makeDomainChunk()],
    });

    expect(result.contextString).toContain("<context>");
    expect(result.contextString).toContain("</context>");
    expect(result.contextString).toContain('<document id="1"');
    expect(result.contextString).toContain("</document>");
    expect(result.confidenceTier).toBe("high");
    expect(result.chunksInjected).toBe(1);
    expect(result.hasQualification).toBe(false);
  });

  it("includes title and section attributes", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [
        makeDomainChunk({
          documentTitle: "BACP Ethical Framework",
          sectionPath: "Principle of Fidelity",
        }),
      ],
    });

    expect(result.contextString).toContain('title="BACP Ethical Framework"');
    expect(result.contextString).toContain('section="Principle of Fidelity"');
  });

  it("omits section attribute when section is null", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [makeDomainChunk({ sectionPath: null })],
    });

    expect(result.contextString).not.toContain("section=");
  });

  it("numbers documents sequentially", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [
        makeDomainChunk({ content: "First chunk" }),
        makeDomainChunk({ content: "Second chunk" }),
        makeDomainChunk({ content: "Third chunk" }),
      ],
    });

    expect(result.contextString).toContain('<document id="1"');
    expect(result.contextString).toContain('<document id="2"');
    expect(result.contextString).toContain('<document id="3"');
    expect(result.chunksInjected).toBe(3);
  });

  it("does not prepend hedging preamble", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [makeDomainChunk()],
    });

    expect(result.contextString).not.toContain("Limited reference material");
  });

  it("respects MAX_CONTEXT_CHUNKS limit", () => {
    const manyChunks = Array.from({ length: 8 }, (_, i) =>
      makeDomainChunk({ content: `Chunk ${i + 1}` })
    );

    const result = buildContextualResponse({
      confidenceTier: "high",
      results: manyChunks,
    });

    expect(result.chunksInjected).toBe(MAX_CONTEXT_CHUNKS);
    // Should not contain chunks beyond the limit
    expect(result.contextString).not.toContain(
      `Chunk ${MAX_CONTEXT_CHUNKS + 1}`
    );
  });

  it("allows overriding maxChunks", () => {
    const chunks = Array.from({ length: 5 }, (_, i) =>
      makeDomainChunk({ content: `Chunk ${i + 1}` })
    );

    const result = buildContextualResponse({
      confidenceTier: "high",
      results: chunks,
      maxChunks: 3,
    });

    expect(result.chunksInjected).toBe(3);
  });
});

// ─── Moderate confidence ────────────────────────────────────────────────────

describe("buildContextualResponse — moderate confidence", () => {
  it("prepends hedging preamble before XML context", () => {
    const result = buildContextualResponse({
      confidenceTier: "moderate",
      results: [makeDomainChunk({ similarityScore: 0.72 })],
    });

    expect(result.contextString).toContain("Limited reference material");
    expect(result.hasQualification).toBe(true);

    // Preamble should come before the XML
    const preambleIndex = result.contextString.indexOf(
      "Limited reference material"
    );
    const contextIndex = result.contextString.indexOf("<context>");
    expect(preambleIndex).toBeLessThan(contextIndex);
  });

  it("still wraps chunks in XML", () => {
    const result = buildContextualResponse({
      confidenceTier: "moderate",
      results: [makeDomainChunk({ similarityScore: 0.72 })],
    });

    expect(result.contextString).toContain("<context>");
    expect(result.contextString).toContain('<document id="1"');
    expect(result.chunksInjected).toBe(1);
  });
});

// ─── Low confidence ─────────────────────────────────────────────────────────

describe("buildContextualResponse — low confidence", () => {
  it("returns supervisor referral with no chunks", () => {
    const result = buildContextualResponse({
      confidenceTier: "low",
      results: [],
    });

    expect(result.contextString).toContain(
      "No sufficiently relevant clinical guidance"
    );
    expect(result.contextString).toContain("consult their supervisor");
    expect(result.chunksInjected).toBe(0);
    expect(result.hasQualification).toBe(true);
    expect(result.confidenceTier).toBe("low");
  });

  it("includes modality when provided — cbt", () => {
    const result = buildContextualResponse({
      confidenceTier: "low",
      results: [],
      modality: "cbt",
    });

    expect(result.contextString).toContain("CBT practice");
  });

  it("includes modality when provided — person_centred", () => {
    const result = buildContextualResponse({
      confidenceTier: "low",
      results: [],
      modality: "person_centred",
    });

    expect(result.contextString).toContain("person-centred practice");
  });

  it("uses generic phrasing when modality is null", () => {
    const result = buildContextualResponse({
      confidenceTier: "low",
      results: [],
      modality: null,
    });

    expect(result.contextString).toContain("therapist's modality");
  });

  it("does not inject any XML even if results are somehow passed", () => {
    // Defensive: low tier should never have results, but if it does,
    // we should still not inject them
    const result = buildContextualResponse({
      confidenceTier: "low",
      results: [makeDomainChunk()],
    });

    expect(result.contextString).not.toContain("<context>");
    expect(result.contextString).not.toContain("<document");
    expect(result.chunksInjected).toBe(0);
  });
});

// ─── Cross-tool field name handling ─────────────────────────────────────────

describe("buildContextualResponse — field name normalisation", () => {
  it("handles camelCase fields from domain tools", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [
        makeDomainChunk({
          documentTitle: "CBT Formulation Guide",
          sectionPath: "Case Conceptualisation",
        }),
      ],
    });

    expect(result.contextString).toContain('title="CBT Formulation Guide"');
    expect(result.contextString).toContain('section="Case Conceptualisation"');
  });

  it("handles snake_case fields from base tool", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [
        makeBaseChunk({
          document_title: "Data Protection Act 2018",
          section_path: "Part 2, Chapter 2",
        }),
      ],
    });

    expect(result.contextString).toContain('title="Data Protection Act 2018"');
    expect(result.contextString).toContain('section="Part 2, Chapter 2"');
  });

  it("falls back to 'Untitled' when no title field is present", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [{ content: "Bare content with no metadata" }],
    });

    expect(result.contextString).toContain('title="Untitled"');
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("buildContextualResponse — edge cases", () => {
  it("degrades to low when high/moderate tier has empty results", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [],
      modality: "psychodynamic",
    });

    // Should defensively treat as low confidence
    expect(result.confidenceTier).toBe("low");
    expect(result.chunksInjected).toBe(0);
    expect(result.contextString).toContain(
      "No sufficiently relevant clinical guidance"
    );
    expect(result.contextString).toContain("psychodynamic practice");
  });

  it("escapes XML-unsafe characters in title", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [
        makeDomainChunk({
          documentTitle: 'Risk & Safety: "Best Practice" Guide',
        }),
      ],
    });

    expect(result.contextString).toContain(
      "Risk &amp; Safety: &quot;Best Practice&quot; Guide"
    );
    // More precisely: should not contain unescaped &
    expect(result.contextString).toContain("Risk &amp;");
  });

  it("preserves chunk content without escaping (content is for LLM, not XML parser)", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [
        makeDomainChunk({
          content:
            "Use the ABC model: Activating event → Beliefs → Consequences",
        }),
      ],
    });

    // Content should be present (we don't escape the body — it's consumed by an LLM)
    expect(result.contextString).toContain("ABC model");
  });

  it("handles single chunk correctly", () => {
    const result = buildContextualResponse({
      confidenceTier: "high",
      results: [makeDomainChunk()],
    });

    expect(result.chunksInjected).toBe(1);
    // Should have exactly one document tag
    const documentMatches = result.contextString.match(/<document /g);
    expect(documentMatches).toHaveLength(1);
  });
});
