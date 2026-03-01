import { type InferAgentUIMessage, stepCountIs, ToolLoopAgent } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  type RequestHints,
  systemPrompt,
  type TherapeuticOrientation,
} from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { knowledgeSearchTools } from "@/lib/ai/tools/knowledge-search-tools";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { searchKnowledgeBase } from "@/lib/ai/tools/search-knowledge-base";
import { updateDocument } from "@/lib/ai/tools/update-document";
import type { Session } from "@/lib/auth";
import { isProductionEnvironment } from "@/lib/constants";

const callOptionsSchema = z.object({
  // Therapeutic context
  therapeuticOrientation: z.custom<TherapeuticOrientation>().optional(),
  effectiveModality: z.string().nullable().optional(),
  effectiveJurisdiction: z.string().nullable().optional(),
  // Sensitive content (already processed by the route)
  sensitiveContentPrompt: z.string().default(""),
  sensitiveCategories: z.array(z.string()).default([]),
  // Session for tool factories
  session: z.custom<Session>(),
  // Request hints for system prompt
  requestHints: z.custom<RequestHints>(),
  // Model selection
  selectedChatModel: z.string(),
  // dataStream for document tools
  dataStream: z.custom<any>(),
});

export const therapyReflectionAgent = new ToolLoopAgent({
  // Default model required by ToolLoopAgentSettings; overridden per-request in prepareCall
  model: getLanguageModel(DEFAULT_CHAT_MODEL),
  callOptionsSchema,
  stopWhen: stepCountIs(6),
  prepareCall: ({ options, ...settings }) => {
    const isReasoningModel =
      options.selectedChatModel.includes("reasoning") ||
      options.selectedChatModel.includes("thinking");

    const fullSystemPrompt =
      systemPrompt({
        selectedChatModel: options.selectedChatModel,
        requestHints: options.requestHints,
        therapeuticOrientation: options.therapeuticOrientation,
        effectiveModality: options.effectiveModality,
        effectiveJurisdiction: options.effectiveJurisdiction,
      }) + options.sensitiveContentPrompt;

    return {
      ...settings,
      model: getLanguageModel(options.selectedChatModel),
      instructions: fullSystemPrompt,
      tools: {
        createDocument: createDocument({
          session: options.session,
          dataStream: options.dataStream,
        }),
        updateDocument: updateDocument({
          session: options.session,
          dataStream: options.dataStream,
        }),
        requestSuggestions: requestSuggestions({
          session: options.session,
          dataStream: options.dataStream,
        }),
        searchKnowledgeBase: searchKnowledgeBase({
          session: options.session,
          sensitiveCategories: options.sensitiveCategories,
        }),
        ...knowledgeSearchTools({
          session: options.session,
          sensitiveCategories: options.sensitiveCategories,
        }),
      },
      providerOptions: isReasoningModel
        ? { anthropic: { thinking: { type: "enabled", budgetTokens: 10_000 } } }
        : undefined,
      experimental_telemetry: {
        isEnabled: isProductionEnvironment,
        functionId: "stream-text",
      },
    };
  },
});

export type TherapyAgentUIMessage = InferAgentUIMessage<
  typeof therapyReflectionAgent
>;
