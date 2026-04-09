import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

/**
 * Hardcode eu-west-1 (Ireland) to ensure all LLM inference stays within EU
 * infrastructure — critical for GDPR Article 9 special category health data.
 * This matches the region used by the Cohere embedding client in lib/ai/embedding.ts.
 */
export const bedrock = createAmazonBedrock({ region: "eu-west-1" });

const THINKING_SUFFIX_REGEX = /-thinking$/;

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.includes("reasoning") || modelId.endsWith("-thinking");

  if (isReasoningModel) {
    const anthropicModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: bedrock(anthropicModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return bedrock(modelId);
}

export function getSmallModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return bedrock("eu.anthropic.claude-haiku-4-5-20251001-v1:0");
}

export function getTitleModel() {
  return getSmallModel();
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  return getSmallModel();
}
