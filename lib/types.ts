import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { createDocument } from "./ai/tools/create-document";
import type { searchKnowledgeBase } from "./ai/tools/search-knowledge-base";
import type { updateDocument } from "./ai/tools/update-document";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type searchKnowledgeBaseTool = InferUITool<
  ReturnType<typeof searchKnowledgeBase>
>;

export type ChatTools = {
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  searchKnowledgeBase: searchKnowledgeBaseTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
  ragStatus: {
    status: "searching" | "complete";
    strategy: "grounded" | "general_knowledge" | "graceful_decline" | null;
    documentCount: number | null;
    confidenceTier: "high" | "moderate" | "low" | null;
  };
};

export type RagStatusData = CustomUIDataTypes["ragStatus"];

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;
