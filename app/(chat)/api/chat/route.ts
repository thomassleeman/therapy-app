import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { therapyReflectionAgent } from "@/lib/ai/agents/therapy-reflection-agent";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { checkFaithfulness } from "@/lib/ai/faithfulness-check";
import { resolveModality } from "@/lib/ai/modality";
import {
  getClientContextPrompt,
  type RequestHints,
  type TherapeuticOrientation,
} from "@/lib/ai/prompts";
import { detectSensitiveContent } from "@/lib/ai/sensitive-content";
import { auth, type UserType } from "@/lib/auth";
import { assembleChatClientContext } from "@/lib/chat/context-assembly";
import { saveFaithfulnessCheck } from "@/lib/db/faithfulness";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getClientById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getSessionTranscriptText,
  getTherapistProfile,
  getTherapySession,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
  updateTherapySession,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/types";
import { devLogger } from "@/lib/dev/logger";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage, RagStatusData } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  return devLogger.run(async () => {
    try {
      const {
        id,
        message,
        messages,
        selectedChatModel,
        selectedClientId,
        selectedSessionId,
        therapeuticOrientation,
      } = requestBody;

      const session = await auth();

      if (!session?.user) {
        return new ChatSDKError("unauthorized:chat").toResponse();
      }

      const userType: UserType = session.user.type;

      const messageCount = await getMessageCountByUserId({
        id: session.user.id,
        differenceInHours: 24,
      });

      if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
        return new ChatSDKError("rate_limit:chat").toResponse();
      }

      const isToolApprovalFlow = Boolean(messages);

      const chat = await getChatById({ id });
      let messagesFromDb: DBMessage[] = [];
      let titlePromise: Promise<string> | null = null;

      if (chat) {
        if (chat.userId !== session.user.id) {
          return new ChatSDKError("forbidden:chat").toResponse();
        }
        if (!isToolApprovalFlow) {
          messagesFromDb = await getMessagesByChatId({ id });
        }
      } else if (message?.role === "user") {
        await saveChat({
          id,
          userId: session.user.id,
          title: "New chat",
          visibility: "private",
          clientId: selectedClientId ?? null,
          sessionId: selectedSessionId ?? null,
        });
        titlePromise = generateTitleFromUserMessage({ message });
        // Bidirectional link: store chatId back on the session
        if (selectedSessionId) {
          updateTherapySession({ id: selectedSessionId, chatId: id }).catch(
            (err) => console.warn("[chat] Failed to link chat to session:", err)
          );
        }
      }

      const uiMessages = isToolApprovalFlow
        ? (messages as ChatMessage[])
        : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

      const { longitude, latitude, city, country } = geolocation(request);

      const requestHints: RequestHints = {
        longitude,
        latitude,
        city,
        country,
      };

      if (message?.role === "user") {
        await saveMessages({
          messages: [
            {
              chatId: id,
              id: message.id,
              role: "user",
              parts: message.parts,

              createdAt: new Date().toISOString(),
            },
          ],
        });
      }

      const modelMessages = await convertToModelMessages(uiMessages);

      // Fetch therapist profile, client, and session transcript context in parallel
      const [therapistProfile, client, therapySession] = await Promise.all([
        getTherapistProfile({ userId: session.user.id }),
        selectedClientId
          ? getClientById({ id: selectedClientId })
          : Promise.resolve(null),
        (() => {
          const effectiveSessionId = selectedSessionId ?? chat?.sessionId;
          return effectiveSessionId
            ? getTherapySession({ id: effectiveSessionId })
            : Promise.resolve(null);
        })(),
      ]);

      // Build session transcript context for the system prompt
      let sessionContextPrompt = "";
      if (therapySession && therapySession.therapistId === session.user.id) {
        const sessionDate = new Date(
          therapySession.sessionDate
        ).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const durationPart = therapySession.durationMinutes
          ? `, ${therapySession.durationMinutes}min`
          : "";

        const hasTranscript =
          therapySession.transcriptionStatus === "completed" ||
          therapySession.transcriptionStatus === "not_applicable";

        if (hasTranscript) {
          const rawTranscript = await getSessionTranscriptText({
            sessionId: therapySession.id,
            recordingType: therapySession.recordingType ?? undefined,
            writtenNotes: therapySession.writtenNotes ?? null,
          });

          if (rawTranscript.length > 0) {
            const MAX_CHARS = 8000;
            let transcriptText: string;
            let truncationNote = "";
            if (rawTranscript.length > MAX_CHARS) {
              transcriptText = rawTranscript.slice(0, MAX_CHARS);
              truncationNote = `\n[Transcript truncated — showing first portion of a ${rawTranscript.length} character transcript]`;
            } else {
              transcriptText = rawTranscript;
            }

            sessionContextPrompt = [
              "",
              `--- CURRENT SESSION TRANSCRIPT (${sessionDate}${durationPart}) ---`,
              "The therapist is reflecting on this specific session. The transcript follows:",
              "",
              transcriptText,
              truncationNote,
              "--- END SESSION TRANSCRIPT ---",
            ]
              .filter((line) => line !== "")
              .join("\n");
          }
        } else {
          sessionContextPrompt = `The therapist is reflecting on a session from ${sessionDate}, but the transcript is not yet available.`;
        }
      }

      const effectiveModality = resolveModality({
        chatOrientation: therapeuticOrientation as
          | TherapeuticOrientation
          | undefined,
        clientModalities: client?.therapeuticModalities,
        therapistDefault: therapistProfile?.defaultModality,
      });

      const effectiveJurisdiction = therapistProfile?.jurisdiction ?? null;

      // Assemble client context if a client is selected
      let clientContextPrompt = "";
      if (selectedClientId) {
        try {
          const { contextBlock } = await assembleChatClientContext({
            clientId: selectedClientId,
            therapistId: session.user.id,
          });
          clientContextPrompt = getClientContextPrompt(contextBlock);
        } catch (error) {
          // Log but don't fail the chat — client context is enhancement, not critical path
          console.error("[chat] Failed to assemble client context:", error);
        }
      }

      // ── Dev logging: start turn ─────────────────────────────────────
      const turnLog = devLogger.startTurn({
        chatId: id,
        userId: session.user.id,
        selectedModel: selectedChatModel,
        effectiveModality,
        effectiveJurisdiction,
      });

      // ── Sensitive content detection ─────────────────────────────────
      // Lightweight keyword scan on the latest user message. Runs in <1ms.
      // When triggered, appends safety-critical instructions to the system
      // prompt and directs the LLM to call specific search tools.
      const lastUserMessage = [...uiMessages]
        .reverse()
        .find((m) => m.role === "user");
      const lastUserMessageText =
        lastUserMessage?.parts
          ?.filter(
            (p): p is { type: "text"; text: string } => p.type === "text"
          )
          .map((p) => p.text)
          .join(" ") ?? "";

      turnLog.setUserMessage(lastUserMessageText);

      const sensitiveContent = detectSensitiveContent(lastUserMessageText);

      turnLog.setSensitiveContent(
        sensitiveContent.detectedCategories.length > 0,
        sensitiveContent.detectedCategories
      );

      let sensitiveContentPrompt = "";
      if (sensitiveContent.detectedCategories.length > 0) {
        sensitiveContentPrompt = [
          "",
          "## Sensitive Content — Safety-Critical Instructions",
          "",
          "The following sensitive content categories were detected in the therapist's message:",
          sensitiveContent.detectedCategories
            .map((c) => `- ${c.replace(/_/g, " ")}`)
            .join("\n"),
          "",
          sensitiveContent.additionalInstructions,
        ].join("\n");

        console.log(
          "[sensitive-content] Detected:",
          sensitiveContent.detectedCategories.join(", ")
        );
      }

      const stream = createUIMessageStream({
        originalMessages: isToolApprovalFlow ? uiMessages : undefined,
        execute: async ({ writer: dataStream }) => {
          // ── RAG status: searching ─────────────────────────────────
          dataStream.write({
            type: "data-ragStatus",
            id: "rag-status",
            data: {
              status: "searching" as const,
              strategy: null,
              documentCount: null,
              confidenceTier: null,
            },
          });

          const result = await therapyReflectionAgent.stream({
            messages: modelMessages,
            options: {
              therapeuticOrientation: therapeuticOrientation as
                | TherapeuticOrientation
                | undefined,
              effectiveModality,
              effectiveJurisdiction,
              clientContextPrompt,
              sensitiveContentPrompt,
              sensitiveCategories: sensitiveContent.detectedCategories,
              sessionContextPrompt,
              session,
              requestHints,
              selectedChatModel,
              dataStream,
            },
          });

          dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

          // ── Blank response detection ─────────────────────────────────────
          // Wait for the agent to finish, then check all observables at once.
          // result.text / totalUsage / steps / finishReason are PromiseLike and
          // resolve internally — they don't re-consume toUIMessageStream().
          const [fullText, totalUsage, steps, finishReason] = await Promise.all(
            [result.text, result.totalUsage, result.steps, result.finishReason]
          );

          if (!fullText || fullText.trim().length === 0) {
            console.warn(
              "[chat] Agent produced no text content — injecting fallback",
              { chatId: id }
            );
            const fallbackId = generateUUID();
            try {
              dataStream.write({ type: "text-start", id: fallbackId });
              dataStream.write({
                type: "text-delta",
                delta:
                  "I wasn't able to formulate a complete response for this question. " +
                  "This can happen when my search didn't return the content I needed. " +
                  "Could you try rephrasing your question, or would you like to explore this from a different angle?",
                id: fallbackId,
              });
              dataStream.write({ type: "text-end", id: fallbackId });
            } catch (err) {
              console.error("[chat] Failed to write fallback text delta:", err);
            }
          }

          // ── RAG status: extract strategy from tool results ──────────
          const kbToolNames = new Set([
            "searchKnowledgeBase",
            "searchLegislation",
            "searchGuidelines",
            "searchTherapeuticContent",
          ]);

          let finalStrategy: RagStatusData["strategy"] = null;
          let finalDocumentCount: number | null = null;
          let finalConfidenceTier: RagStatusData["confidenceTier"] = null;

          for (const step of steps) {
            for (const toolResult of step.toolResults ?? []) {
              if (kbToolNames.has(toolResult.toolName)) {
                const output = toolResult.output as Record<string, unknown>;
                if (output.strategy && typeof output.strategy === "string") {
                  finalStrategy = output.strategy as RagStatusData["strategy"];
                  finalDocumentCount =
                    typeof output.result_count === "number"
                      ? output.result_count
                      : null;
                  finalConfidenceTier =
                    typeof output.confidenceTier === "string"
                      ? (output.confidenceTier as RagStatusData["confidenceTier"])
                      : null;
                }
              }
            }
          }

          if (!fullText || fullText.trim().length === 0) {
            finalStrategy = "graceful_decline";
            finalConfidenceTier = "low";
            finalDocumentCount = 0;
          }

          dataStream.write({
            type: "data-ragStatus",
            id: "rag-status",
            data: {
              status: "complete" as const,
              strategy: finalStrategy,
              documentCount: finalDocumentCount,
              confidenceTier: finalConfidenceTier,
            },
          });

          // ── Usage and finish reason logging ──────────────────────────────
          const toolCallCount = steps.reduce(
            (count, step) => count + (step.toolCalls ?? []).length,
            0
          );
          console.log("[chat] Response complete:", {
            chatId: id,
            model: selectedChatModel,
            finishReason,
            totalSteps: steps.length,
            inputTokens: totalUsage.inputTokens,
            outputTokens: totalUsage.outputTokens,
            totalTokens: totalUsage.totalTokens,
            toolCallCount,
            hadSensitiveContent: sensitiveContent.detectedCategories.length > 0,
          });

          if (titlePromise) {
            const title = await titlePromise;
            dataStream.write({ type: "data-chat-title", data: title });
            updateChatTitleById({ chatId: id, title });
          }
        },
        generateId: generateUUID,
        onFinish: async ({ messages: finishedMessages }) => {
          if (isToolApprovalFlow) {
            for (const finishedMsg of finishedMessages) {
              const existingMsg = uiMessages.find(
                (m) => m.id === finishedMsg.id
              );
              if (existingMsg) {
                await updateMessage({
                  id: finishedMsg.id,
                  parts: finishedMsg.parts,
                });
              } else {
                await saveMessages({
                  messages: [
                    {
                      id: finishedMsg.id,
                      role: finishedMsg.role,
                      parts: finishedMsg.parts,
                      createdAt: new Date().toISOString(),
        
                      chatId: id,
                    },
                  ],
                });
              }
            }
          } else if (finishedMessages.length > 0) {
            await saveMessages({
              messages: finishedMessages.map((currentMessage) => ({
                id: currentMessage.id,
                role: currentMessage.role,
                parts: currentMessage.parts,
                createdAt: new Date().toISOString(),
  
                chatId: id,
              })),
            });
          }

          // ── Dev logging: capture response + derive quality signals ───
          const assistantMsg = finishedMessages.findLast(
            (m) => m.role === "assistant"
          );
          const responseText =
            assistantMsg?.parts
              ?.filter(
                (p): p is { type: "text"; text: string } => p.type === "text"
              )
              .map((p) => p.text)
              .join("") ?? "";

          turnLog.setResponse(responseText);
          turnLog.computeQualitySignals();

          // ── Faithfulness check (fire-and-forget via after()) ─────────
          // Only runs for grounded responses — strategy must be 'grounded'
          // in at least one tool result. Skips general_knowledge and
          // graceful_decline (no KB chunks to verify against).
          if (process.env.ENABLE_FAITHFULNESS_CHECK === "true") {
            // In AI SDK v6, tool parts are typed as `tool-{toolName}` with
            // `state: 'output-available'` and an `output` field (not `result`).
            // We cast to Record<string, unknown> to avoid TypeScript narrowing
            // errors while still accessing the runtime shape safely.
            type GroundedOutput = {
              strategy?: string;
              results?: Array<{
                id: string;
                content: string;
                documentTitle: string;
              }>;
            };

            const retrievedChunks: Array<{
              id: string;
              content: string;
              documentTitle: string;
            }> = [];

            for (const msg of finishedMessages) {
              for (const rawPart of msg.parts ?? []) {
                const part = rawPart as Record<string, unknown>;
                if (
                  typeof part.type !== "string" ||
                  !part.type.startsWith("tool-")
                ) {
                  continue;
                }
                if (part.state !== "output-available") {
                  continue;
                }
                const output = part.output as GroundedOutput | undefined;
                if (
                  output?.strategy === "grounded" &&
                  Array.isArray(output.results)
                ) {
                  for (const r of output.results) {
                    if (r.id && r.content && r.documentTitle) {
                      retrievedChunks.push({
                        id: r.id,
                        content: r.content,
                        documentTitle: r.documentTitle,
                      });
                    }
                  }
                }
              }
            }

            if (retrievedChunks.length > 0 && responseText) {
              const faithfulnessChatId = id;
              const faithfulnessMessageId = assistantMsg?.id ?? "";

              after(async () => {
                const result = await checkFaithfulness(
                  responseText,
                  retrievedChunks
                );
                await saveFaithfulnessCheck({
                  chatId: faithfulnessChatId,
                  messageId: faithfulnessMessageId,
                  result,
                });
                console.log(
                  `[faithfulness] chatId=${faithfulnessChatId} score=${result.overallScore} flagged=${result.flagged} latency=${result.evaluationLatencyMs}ms`
                );
                if (result.flagged) {
                  console.warn(
                    `[faithfulness] FLAGGED response — score ${result.overallScore} below threshold. chatId=${faithfulnessChatId} messageId=${faithfulnessMessageId}`
                  );
                }
              });
            }
          }
        },
        onError: () => "Oops, an error occurred!",
      });

      // ── Dev logging: flush after response is sent ───────────────────
      after(() => turnLog.flush());

      return createUIMessageStreamResponse({
        stream,
        async consumeSseStream({ stream: sseStream }) {
          if (!process.env.REDIS_URL) {
            return;
          }
          try {
            const streamContext = getStreamContext();
            if (streamContext) {
              const streamId = generateId();
              await createStreamId({ streamId, chatId: id });
              await streamContext.createNewResumableStream(
                streamId,
                () => sseStream
              );
            }
          } catch (_) {
            // ignore redis errors
          }
        },
      });
    } catch (error) {
      const vercelId = request.headers.get("x-vercel-id");

      if (error instanceof ChatSDKError) {
        return error.toResponse();
      }

      if (
        error instanceof Error &&
        error.message?.includes(
          "AI Gateway requires a valid credit card on file to service requests"
        )
      ) {
        return new ChatSDKError("bad_request:activate_gateway").toResponse();
      }

      console.error("Unhandled error in chat API:", error, { vercelId });
      return new ChatSDKError("offline:chat").toResponse();
    }
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
