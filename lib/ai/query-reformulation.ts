/**
 * Multi-query retrieval: LLM-based query reformulation for the therapy RAG pipeline.
 *
 * Bridges the semantic gap between conversational therapist language and formal
 * clinical terminology in the knowledge base. Research shows ~20% of retrieval
 * failures are caused by vocabulary mismatch — a therapist saying "my client
 * keeps going quiet" may not land near chunks about "therapeutic rupture" or
 * "metacommunication" via embedding alone.
 *
 * Cost when enabled: ~$0.0003 per search invocation (one gpt-4o-mini call).
 * Gate: ENABLE_QUERY_REFORMULATION=true
 */

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Generates clinical reformulations of a therapist's search query using GPT-4o-mini.
 *
 * Returns `[originalQuery, ...reformulations]` — the original is always included
 * so that the caller never searches with fewer than one query.
 *
 * When `ENABLE_QUERY_REFORMULATION` is not `"true"`, returns `[originalQuery]`
 * immediately (behaviour identical to pre-multi-query).
 *
 * If `generateObject` fails for any reason, logs the error and returns
 * `[originalQuery]` for graceful degradation.
 */
export async function reformulateQuery(
  originalQuery: string,
  category: string | null,
  modality: string | null
): Promise<string[]> {
  if (process.env.ENABLE_QUERY_REFORMULATION !== "true") {
    return [originalQuery];
  }

  const start = performance.now();

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      temperature: 0.3,
      schema: z.object({
        reformulations: z
          .array(z.string())
          .length(3)
          .describe(
            "Three reformulations using clinical terminology that therapeutic framework documents and professional guidelines would use"
          ),
      }),
      prompt: `You are a clinical terminology expert helping bridge the gap between conversational therapist language and formal clinical knowledge base content.

Given a therapist's search query, generate exactly 3 reformulations that might match content in a clinical knowledge base containing:
- Legislation briefings (UK Data Protection Act, GDPR, Mental Health Act, Children Act, Care Act)
- Professional body guidelines (BACP, UKCP, HCPC, IACP ethical frameworks)
- Therapeutic framework guidance (CBT techniques, person-centred approaches, psychodynamic concepts)
- Clinical practice guidance (documentation, note-taking, treatment planning)

${category ? `Content category: ${category}` : ""}
${modality ? `Therapeutic modality: ${modality}` : ""}
Original query: "${originalQuery}"

Generate 3 reformulations. Each should:
1. Use different clinical vocabulary while preserving the original intent
2. Include formal diagnostic, therapeutic, or legal terminology where appropriate
3. Be the kind of phrase that would appear as a heading or key phrase in clinical guidelines

Examples of the kind of reformulation needed:
- "client went quiet" → "therapeutic rupture withdrawal metacommunication"
- "when can I break confidentiality" → "mandatory disclosure exceptions confidentiality limits"
- "client keeps cancelling" → "therapeutic resistance avoidance attendance engagement"`,
    });

    const ms = Math.round(performance.now() - start);
    console.log(`[reformulate] 3 variants in ${ms}ms`);

    return [originalQuery, ...object.reformulations];
  } catch (err) {
    console.error(
      "[reformulate] generateObject failed — falling back to original query:",
      err
    );
    return [originalQuery];
  }
}
