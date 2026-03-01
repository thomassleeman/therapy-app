/**
 * Post-generation faithfulness verification for the therapy RAG pipeline.
 *
 * Runs asynchronously after `streamText` completes. Evaluates whether the
 * LLM's response is grounded in the retrieved knowledge base chunks. Results
 * are saved to the `faithfulness_checks` table for monitoring.
 *
 * This check NEVER blocks the response stream. It must only be called from
 * within an `after()` block or similar fire-and-forget context.
 *
 * Feature-gated: set ENABLE_FAITHFULNESS_CHECK=true to activate.
 */

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FaithfulnessClaimResult {
  claim: string;
  supported: boolean;
  sourceChunkId: string | null;
  reasoning: string;
}

export interface FaithfulnessResult {
  claims: FaithfulnessClaimResult[];
  overallScore: number; // 0–1, proportion of supported claims
  flagged: boolean; // true if overallScore < FAITHFULNESS_THRESHOLD
  evaluationLatencyMs: number;
}

export const FAITHFULNESS_THRESHOLD = 0.7;

// ─── Schema ──────────────────────────────────────────────────────────────────

const faithfulnessSchema = z.object({
  claims: z.array(
    z.object({
      claim: z
        .string()
        .describe("A single factual claim extracted from the AI response"),
      supported: z
        .boolean()
        .describe(
          "Whether this claim is directly supported by the source chunks"
        ),
      sourceChunkId: z
        .string()
        .nullable()
        .describe("ID of the supporting chunk, or null"),
      reasoning: z
        .string()
        .describe("Brief explanation of the support/non-support verdict"),
    })
  ),
});

// ─── No-op result ────────────────────────────────────────────────────────────

const NO_OP_RESULT: FaithfulnessResult = {
  claims: [],
  overallScore: 1.0,
  flagged: false,
  evaluationLatencyMs: 0,
};

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Evaluates whether the LLM response is supported by the retrieved chunks.
 *
 * Only factual assertions about clinical practice, therapeutic techniques,
 * legislation, professional guidelines, or ethical obligations are checked.
 * Reflective questions (the agent's core output) are excluded.
 *
 * @param response - The assistant's full response text
 * @param retrievedChunks - The KB chunks that were retrieved for this response
 * @returns A FaithfulnessResult with per-claim verdicts and an overall score
 */
export async function checkFaithfulness(
  response: string,
  retrievedChunks: { id: string; content: string; documentTitle: string }[]
): Promise<FaithfulnessResult> {
  if (process.env.ENABLE_FAITHFULNESS_CHECK !== "true") {
    return NO_OP_RESULT;
  }

  if (!response.trim() || retrievedChunks.length === 0) {
    return NO_OP_RESULT;
  }

  const start = performance.now();

  try {
    const sourceContext = retrievedChunks
      .map((c) => `[${c.id}] (${c.documentTitle}): ${c.content}`)
      .join("\n\n");

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      temperature: 0,
      schema: faithfulnessSchema,
      prompt: `You are a clinical accuracy auditor for a therapy reflection platform. Given an AI-generated response and the source chunks it was based on, evaluate whether each factual claim in the response is supported by the source material.

A claim is "supported" if the source material directly states or clearly implies the same information. A claim is "unsupported" if it goes beyond what the sources say, contradicts the sources, or introduces information not present in any source.

Ignore reflective questions (these are the agent's core function and don't need source support). Only evaluate factual assertions about clinical practice, therapeutic techniques, legislation, professional guidelines, or ethical obligations.

SOURCE CHUNKS:
${sourceContext}

AI RESPONSE:
${response}

Extract each factual claim and evaluate it against the sources.`,
    });

    const evaluationLatencyMs = Math.round(performance.now() - start);
    const totalClaims = object.claims.length;
    const supportedClaims = object.claims.filter((c) => c.supported).length;

    // A purely reflective response with no factual claims is vacuously faithful.
    const overallScore =
      totalClaims === 0 ? 1.0 : supportedClaims / totalClaims;
    const flagged = overallScore < FAITHFULNESS_THRESHOLD;

    return {
      claims: object.claims,
      overallScore,
      flagged,
      evaluationLatencyMs,
    };
  } catch (error) {
    console.error(
      "[faithfulness] generateObject failed — skipping check:",
      error
    );
    return NO_OP_RESULT;
  }
}
