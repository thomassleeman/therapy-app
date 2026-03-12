/**
 * Cohere Embed v4 via AWS Bedrock (eu-west-1).
 *
 * We call Bedrock directly via @aws-sdk/client-bedrock-runtime rather than
 * using @ai-sdk/amazon-bedrock because the AI SDK has a known request format
 * bug with Cohere embedding models.
 *
 * All embedding requests are routed through the eu-west-1 (Ireland) region to
 * ensure therapist search queries — which may contain special category health
 * data under UK GDPR Article 9 — are processed within European infrastructure.
 *
 * The `inputType` parameter controls how Cohere optimises the embedding:
 * - `"search_query"` — used at query time when a therapist searches
 * - `"search_document"` — used at ingestion time when indexing knowledge base chunks
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export const EMBEDDING_MODEL = "cohere.embed-v4:0";
export const EMBEDDING_DIMENSIONS = 512;
export const BEDROCK_REGION = "eu-west-1";

const BATCH_SIZE = 96;

let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (client) {
    return client;
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "[Bedrock/Cohere] Missing AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables."
    );
  }

  client = new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return client;
}

interface CohereEmbedResponse {
  embeddings: {
    float: number[][];
  };
}

async function invokeEmbed(
  texts: string[],
  inputType: "search_query" | "search_document"
): Promise<number[][]> {
  const body = JSON.stringify({
    texts,
    input_type: inputType,
    embedding_types: ["float"],
    output_dimension: EMBEDDING_DIMENSIONS,
  });

  const command = new InvokeModelCommand({
    modelId: EMBEDDING_MODEL,
    contentType: "application/json",
    accept: "*/*",
    body: new TextEncoder().encode(body),
  });

  const response = await getClient().send(command);
  const decoded = new TextDecoder().decode(response.body);
  const parsed: CohereEmbedResponse = JSON.parse(decoded);

  return parsed.embeddings.float;
}

export async function generateEmbedding(
  text: string,
  inputType: "search_query" | "search_document" = "search_query"
): Promise<number[]> {
  try {
    const embeddings = await invokeEmbed([text], inputType);
    return embeddings[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Bedrock/Cohere] Embedding error:", message);
    throw new Error(
      `[Bedrock/Cohere] Failed to generate embedding: ${message}`
    );
  }
}

export async function generateEmbeddings(
  texts: string[],
  inputType: "search_query" | "search_document" = "search_document"
): Promise<number[][]> {
  try {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await invokeEmbed(batch, inputType);
      results.push(...embeddings);
    }

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Bedrock/Cohere] Batch embedding error:", message);
    throw new Error(
      `[Bedrock/Cohere] Failed to generate embeddings: ${message}`
    );
  }
}
