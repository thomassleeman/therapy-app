import "server-only";

import { randomUUID } from "node:crypto";
import type { ArtifactKind } from "@/components/artifact";
import type {
  ClinicalDocumentStatus,
  ClinicalDocumentType,
} from "@/lib/documents/types";
import {
  decryptJsonb,
  decryptSegments,
  encryptJsonb,
} from "@/lib/encryption/fields";
import { createClient } from "@/utils/supabase/server";
import { ChatSDKError } from "../errors";
import type {
  Chat,
  Client,
  ClientInsert,
  ClientTag,
  ClinicalDocument,
  ClinicalDocumentInsert,
  ClinicalDocumentReference,
  ClinicalDocumentSummary,
  ClinicalDocumentWithReferences,
  ClinicalNote,
  ClinicalNoteInsert,
  ClinicalNoteWithSession,
  ConsentingParty,
  ConsentType,
  CustomNoteFormat,
  CustomNoteFormatInsert,
  CustomNoteFormatSection,
  CustomNoteFormatUpdate,
  DBMessage,
  Document,
  HybridSearchResult,
  NoteContent,
  NoteStatus,
  RecentSession,
  RecordingType,
  SessionConsent,
  SessionConsentInsert,
  SessionSegment,
  SessionSegmentInsert,
  SidebarSession,
  TherapistProfile,
  TherapistProfileInsert,
  TherapySession,
  TherapySessionInsert,
  TherapySessionWithClient,
} from "./types";

// Re-export types for backward compatibility
export type {
  Chat,
  Client,
  ClientTag,
  ClinicalNote,
  ClinicalNoteInsert,
  ClinicalNoteWithSession,
  DBMessage,
  Document,
  HybridSearchResult,
  RecentSession,
  SessionConsent,
  SessionConsentInsert,
  SessionSegment,
  SessionSegmentInsert,
  SidebarSession,
  Suggestion,
  TherapistProfile,
  TherapistProfileInsert,
  TherapySession,
  TherapySessionInsert,
  TherapySessionWithClient,
  Vote,
} from "./types";

// Helper: map a raw clients row (snake_case) to the Client interface (camelCase)
function mapRowToClient(row: any): Client {
  return {
    id: row.id,
    therapistId: row.therapist_id,
    name: row.name,
    background: row.background ?? null,
    therapeuticModalities: row.therapeutic_modalities ?? [],
    presentingIssues: row.presenting_issues ?? null,
    treatmentGoals: row.treatment_goals ?? null,
    riskConsiderations: row.risk_considerations ?? null,
    status: row.status ?? "active",
    sessionFrequency: row.session_frequency ?? null,
    deliveryMethod: row.delivery_method ?? null,
    therapyStartDate: row.therapy_start_date ?? null,
    referralSource: row.referral_source ?? null,
    ageBracket: row.age_bracket ?? null,
    gender: row.gender ?? null,
    sessionDurationMinutes: row.session_duration_minutes ?? null,
    contractedSessions: row.contracted_sessions ?? null,
    feePerSession:
      row.fee_per_session == null ? null : Number(row.fee_per_session),
    supervisorNotes: row.supervisor_notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper function to handle Supabase errors
function handleSupabaseError(
  error: { message: string; code?: string },
  operation: string
): never {
  console.error(`Supabase error in ${operation}:`, error);
  throw new ChatSDKError("bad_request:database", `Failed to ${operation}`);
}

export async function getUser(
  email: string
): Promise<{ id: string; email: string }[]> {
  try {
    const supabase = await createClient();

    // With Supabase Auth, users are in auth.users table
    // We query by email through the admin API or use the current user's session
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return [];
    }

    if (user.email === email) {
      return [{ id: user.id, email: user.email }];
    }

    return [];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  clientId,
  sessionId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: "private" | "public";
  clientId?: string | null;
  sessionId?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Chat")
      .insert({
        id,
        createdAt: new Date().toISOString(),
        userId,
        title,
        visibility,
        clientId: clientId ?? null,
        sessionId: sessionId ?? null,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "save chat");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    const supabase = await createClient();

    // With CASCADE constraints, we only need to delete the chat
    // Related messages, votes, and streams will be deleted automatically
    const { data, error } = await supabase
      .from("Chat")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "delete chat by id");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const supabase = await createClient();

    // With CASCADE constraints, deleting chats will cascade to related tables
    const { data, error } = await supabase
      .from("Chat")
      .delete()
      .eq("userId", userId)
      .select();

    if (error) {
      handleSupabaseError(error, "delete all chats by user id");
    }
    return { deletedCount: data?.length ?? 0 };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const supabase = await createClient();
    const extendedLimit = limit + 1;

    let query = supabase
      .from("Chat")
      .select("*")
      .eq("userId", id)
      .order("createdAt", { ascending: false })
      .limit(extendedLimit);

    if (startingAfter) {
      // Get the cursor chat's createdAt
      const { data: cursorChat, error: cursorError } = await supabase
        .from("Chat")
        .select("createdAt")
        .eq("id", startingAfter)
        .single();

      if (cursorError || !cursorChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      query = query.gt("createdAt", cursorChat.createdAt);
    } else if (endingBefore) {
      const { data: cursorChat, error: cursorError } = await supabase
        .from("Chat")
        .select("createdAt")
        .eq("id", endingBefore)
        .single();

      if (cursorError || !cursorChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      query = query.lt("createdAt", cursorChat.createdAt);
    }

    const { data: filteredChats, error } = await query;

    if (error) {
      handleSupabaseError(error, "get chats by user id");
    }

    const chats = filteredChats as Chat[];
    const hasMore = chats.length > limit;

    return {
      chats: hasMore ? chats.slice(0, limit) : chats,
      hasMore,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Chat")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      // PGRST116 is "not found" error
      if (error.code === "PGRST116") {
        return null;
      }
      handleSupabaseError(error, "get chat by id");
    }

    return data as Chat;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    const supabase = await createClient();
    const encryptedMessages = await Promise.all(
      messages.map(async (msg) => ({
        id: msg.id,
        chatId: msg.chatId,
        role: msg.role,
        parts: await encryptJsonb(msg.parts, msg.id),
        createdAt: msg.createdAt,
      }))
    );
    const { data, error } = await supabase
      .from("Message_v2")
      .insert(encryptedMessages)
      .select();

    if (error) {
      handleSupabaseError(error, "save messages");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    const supabase = await createClient();
    const encryptedParts = await encryptJsonb(parts, id);
    const { data, error } = await supabase
      .from("Message_v2")
      .update({ parts: encryptedParts })
      .eq("id", id)
      .select();

    if (error) {
      handleSupabaseError(error, "update message");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Message_v2")
      .select("*")
      .eq("chatId", id)
      .order("createdAt", { ascending: true });

    if (error) {
      handleSupabaseError(error, "get messages by chat id");
    }
    const messages = (data ?? []) as DBMessage[];
    return Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        parts: await decryptJsonb(msg.parts, msg.id),
      }))
    );
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Document")
      .insert({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date().toISOString(),
      })
      .select();

    if (error) {
      handleSupabaseError(error, "save document");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Document")
      .select("*")
      .eq("id", id)
      .order("createdAt", { ascending: true });

    if (error) {
      handleSupabaseError(error, "get documents by id");
    }
    return data as Document[];
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Document")
      .select("*")
      .eq("id", id)
      .order("createdAt", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      handleSupabaseError(error, "get document by id");
    }
    return data as Document;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    const supabase = await createClient();

    // Delete suggestions first (since they reference documents)
    await supabase
      .from("Suggestion")
      .delete()
      .eq("documentId", id)
      .gt("documentCreatedAt", timestamp.toISOString());

    // Then delete documents
    const { data, error } = await supabase
      .from("Document")
      .delete()
      .eq("id", id)
      .gt("createdAt", timestamp.toISOString())
      .select();

    if (error) {
      handleSupabaseError(error, "delete documents by id after timestamp");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Message_v2")
      .select("*")
      .eq("id", id);

    if (error) {
      handleSupabaseError(error, "get message by id");
    }
    const messages = (data ?? []) as DBMessage[];
    return Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        parts: await decryptJsonb(msg.parts, msg.id),
      }))
    );
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const supabase = await createClient();

    // Get messages to delete first (to delete their votes)
    const { data: messagesToDelete, error: selectError } = await supabase
      .from("Message_v2")
      .select("id")
      .eq("chatId", chatId)
      .gte("createdAt", timestamp.toISOString());

    if (selectError) {
      handleSupabaseError(selectError, "get messages to delete");
    }

    const messageIds = (messagesToDelete || []).map((m) => m.id);

    if (messageIds.length > 0) {
      // Delete votes for these messages
      await supabase
        .from("Vote_v2")
        .delete()
        .eq("chatId", chatId)
        .in("messageId", messageIds);

      // Delete the messages
      const { error: deleteError } = await supabase
        .from("Message_v2")
        .delete()
        .eq("chatId", chatId)
        .in("id", messageIds);

      if (deleteError) {
        handleSupabaseError(deleteError, "delete messages");
      }
    }

    return { deleted: messageIds.length };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("Chat")
      .update({ title })
      .eq("id", chatId);

    if (error) {
      console.warn("Failed to update title for chat", chatId, error);
      return;
    }
  } catch (error) {
    console.warn("Failed to update title for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const supabase = await createClient();

    // Use the database function we created for rate limiting
    const { data, error } = await supabase.rpc("get_user_message_count", {
      p_user_id: id,
      p_hours_ago: differenceInHours,
    });

    if (error) {
      // If the function doesn't exist, fall back to a manual query
      console.warn("RPC function not available, using fallback query:", error);

      const timeThreshold = new Date(
        Date.now() - differenceInHours * 60 * 60 * 1000
      ).toISOString();

      // Fallback: Get chats for user, then count messages
      const { data: userChats, error: chatError } = await supabase
        .from("Chat")
        .select("id")
        .eq("userId", id);

      if (chatError) {
        handleSupabaseError(chatError, "get user chats for message count");
      }

      if (!userChats || userChats.length === 0) {
        return 0;
      }

      const chatIds = userChats.map((c) => c.id);

      const { count, error: countError } = await supabase
        .from("Message_v2")
        .select("*", { count: "exact", head: true })
        .in("chatId", chatIds)
        .eq("role", "user")
        .gte("createdAt", timeThreshold);

      if (countError) {
        handleSupabaseError(countError, "count messages");
      }

      return count ?? 0;
    }

    return data ?? 0;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("Stream").insert({
      id: streamId,
      chatId,
      createdAt: new Date().toISOString(),
    });

    if (error) {
      handleSupabaseError(error, "create stream id");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Stream")
      .select("id")
      .eq("chatId", chatId)
      .order("createdAt", { ascending: true });

    if (error) {
      handleSupabaseError(error, "get stream ids by chat id");
    }
    return (data || []).map(({ id }) => id);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

// Client CRUD operations

export async function getClientsByUserId({ userId }: { userId: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("therapist_id", userId)
      .order("name", { ascending: true });

    if (error) {
      handleSupabaseError(error, "get clients by user id");
    }

    const clients = (data || []).map(mapRowToClient);

    // Bulk-fetch tags for all clients
    if (clients.length > 0) {
      const clientIds = clients.map((c) => c.id);
      const { data: tagData } = await supabase
        .from("client_tag_assignments")
        .select("client_id, tag_id, client_tags(name)")
        .in("client_id", clientIds);

      if (tagData) {
        const tagsByClient = new Map<string, string[]>();
        for (const row of tagData) {
          const clientId = row.client_id as string;
          const tagName = (row as any).client_tags?.name as string | undefined;
          if (tagName) {
            const existing = tagsByClient.get(clientId) ?? [];
            existing.push(tagName);
            tagsByClient.set(clientId, existing);
          }
        }
        for (const client of clients) {
          client.tags = tagsByClient.get(client.id) ?? [];
        }
      }
    }

    return clients;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get clients by user id"
    );
  }
}

export async function getClientById({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      handleSupabaseError(error, "get client by id");
    }

    const client = mapRowToClient(data);

    // Fetch tags
    const { data: tagData } = await supabase
      .from("client_tag_assignments")
      .select("client_id, tag_id, client_tags(name)")
      .eq("client_id", id);

    client.tags = (tagData ?? [])
      .map((row: any) => (row as any).client_tags?.name as string | undefined)
      .filter((name): name is string => Boolean(name));

    return client;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get client by id"
    );
  }
}

export async function createClientRecord(params: ClientInsert) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .insert({
        therapist_id: params.therapistId,
        name: params.name,
        background: params.background ?? null,
        therapeutic_modalities: params.therapeuticModalities ?? [],
        presenting_issues: params.presentingIssues ?? null,
        treatment_goals: params.treatmentGoals ?? null,
        risk_considerations: params.riskConsiderations ?? null,
        status: params.status ?? "active",
        session_frequency: params.sessionFrequency ?? null,
        delivery_method: params.deliveryMethod ?? null,
        therapy_start_date: params.therapyStartDate ?? null,
        referral_source: params.referralSource ?? null,
        age_bracket: params.ageBracket ?? null,
        gender: params.gender ?? null,
        session_duration_minutes: params.sessionDurationMinutes ?? null,
        contracted_sessions: params.contractedSessions ?? null,
        fee_per_session: params.feePerSession ?? null,
        supervisor_notes: params.supervisorNotes ?? null,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "create client");
    }

    return mapRowToClient(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to create client");
  }
}

export async function updateClientById({
  id,
  ...fields
}: Omit<ClientInsert, "therapistId"> & { id: string }) {
  try {
    const supabase = await createClient();

    // Map camelCase fields to snake_case columns, only including provided fields
    const fieldMap: [string, string, unknown][] = [
      ["name", "name", fields.name],
      ["background", "background", fields.background],
      [
        "therapeuticModalities",
        "therapeutic_modalities",
        fields.therapeuticModalities,
      ],
      ["presentingIssues", "presenting_issues", fields.presentingIssues],
      ["treatmentGoals", "treatment_goals", fields.treatmentGoals],
      ["riskConsiderations", "risk_considerations", fields.riskConsiderations],
      ["status", "status", fields.status],
      ["sessionFrequency", "session_frequency", fields.sessionFrequency],
      ["deliveryMethod", "delivery_method", fields.deliveryMethod],
      ["therapyStartDate", "therapy_start_date", fields.therapyStartDate],
      ["referralSource", "referral_source", fields.referralSource],
      ["ageBracket", "age_bracket", fields.ageBracket],
      ["gender", "gender", fields.gender],
      [
        "sessionDurationMinutes",
        "session_duration_minutes",
        fields.sessionDurationMinutes,
      ],
      ["contractedSessions", "contracted_sessions", fields.contractedSessions],
      ["feePerSession", "fee_per_session", fields.feePerSession],
      ["supervisorNotes", "supervisor_notes", fields.supervisorNotes],
    ];

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const [camelKey, snakeKey, value] of fieldMap) {
      if ((fields as Record<string, unknown>)[camelKey] !== undefined) {
        updatePayload[snakeKey] = value;
      }
    }

    const { data, error } = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "update client by id");
    }

    return mapRowToClient(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update client by id"
    );
  }
}

export async function deleteClientById({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (error) {
      handleSupabaseError(error, "delete client by id");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete client by id"
    );
  }
}

export async function getChatsByClientId({
  clientId,
  userId,
}: {
  clientId: string | null;
  userId: string;
}) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("Chat")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false });

    if (clientId === null) {
      query = query.is("clientId", null);
    } else {
      query = query.eq("clientId", clientId);
    }

    const { data, error } = await query;

    if (error) {
      handleSupabaseError(error, "get chats by client id");
    }
    return data as Chat[];
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chats by client id"
    );
  }
}

export async function getChatCountsByClient({ userId }: { userId: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Chat")
      .select("clientId")
      .eq("userId", userId);

    if (error) {
      handleSupabaseError(error, "get chat counts by client");
    }

    const counts = new Map<string | null, number>();
    for (const chat of data || []) {
      const key = chat.clientId ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([clientId, count]) => ({
      clientId,
      count,
    }));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chat counts by client"
    );
  }
}

export async function getRecentDocumentsByUserId({
  userId,
  limit = 5,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Document")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(limit);

    if (error) {
      handleSupabaseError(error, "get recent documents by user id");
    }
    return data as Document[];
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get recent documents by user id"
    );
  }
}

export async function updateChatClientById({
  chatId,
  clientId,
}: {
  chatId: string;
  clientId: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Chat")
      .update({ clientId })
      .eq("id", chatId)
      .select();

    if (error) {
      handleSupabaseError(error, "update chat client by id");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat client by id"
    );
  }
}

// ============================================================
// Tag management
// ============================================================

export async function getTagsByTherapistId({
  therapistId,
}: {
  therapistId: string;
}): Promise<ClientTag[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_tags")
      .select("*")
      .eq("therapist_id", therapistId)
      .order("name", { ascending: true });

    if (error) {
      handleSupabaseError(error, "get tags by therapist id");
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      therapistId: row.therapist_id,
      name: row.name,
      createdAt: row.created_at,
    }));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get tags by therapist id"
    );
  }
}

export async function createTag({
  therapistId,
  name,
}: {
  therapistId: string;
  name: string;
}): Promise<ClientTag> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_tags")
      .insert({ therapist_id: therapistId, name })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "create tag");
    }

    return {
      id: data.id,
      therapistId: data.therapist_id,
      name: data.name,
      createdAt: data.created_at,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to create tag");
  }
}

export async function deleteTag({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("client_tags").delete().eq("id", id);

    if (error) {
      handleSupabaseError(error, "delete tag");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to delete tag");
  }
}

export async function setClientTags({
  clientId,
  tagIds,
}: {
  clientId: string;
  tagIds: string[];
}) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_client_tags", {
      p_client_id: clientId,
      p_tag_ids: tagIds,
    });

    if (error) {
      handleSupabaseError(error, "set client tags");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to set client tags");
  }
}

// ============================================================
// RAG hybrid search
// ============================================================

export async function hybridSearch({
  queryText,
  queryEmbedding,
  matchCount = 5,
  filterCategory,
  filterModality,
  filterJurisdiction,
  fullTextWeight = 1.0,
  semanticWeight = 1.0,
  rrfK = 60,
}: {
  queryText: string;
  queryEmbedding: number[];
  matchCount?: number;
  filterCategory?: string | null;
  filterModality?: string | null;
  filterJurisdiction?: string | null;
  fullTextWeight?: number;
  semanticWeight?: number;
  rrfK?: number;
}): Promise<HybridSearchResult[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("hybrid_search", {
      query_text: queryText,
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: matchCount,
      filter_category: filterCategory ?? null,
      filter_modality: filterModality ?? null,
      filter_jurisdiction: filterJurisdiction ?? null,
      full_text_weight: fullTextWeight,
      semantic_weight: semanticWeight,
      rrf_k: rrfK,
    });

    if (error) {
      handleSupabaseError(error, "hybrid search");
    }

    if (!data) {
      return [];
    }

    return (data as any[]).map((row) => ({
      id: row.id,
      content: row.content,
      documentId: row.document_id,
      sectionPath: row.section_path,
      documentTitle: row.document_title,
      modality: row.modality,
      jurisdiction: row.jurisdiction,
      documentType: row.document_type,
      metadata: row.metadata,
      similarityScore: row.similarity_score,
      combinedRrfScore: row.combined_rrf_score,
    }));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to hybrid search");
  }
}

// ============================================================
// Therapist profile
// ============================================================

export async function getTherapistProfile({
  userId,
}: {
  userId: string;
}): Promise<TherapistProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapist_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    handleSupabaseError(error, "get therapist profile");
  }

  return data
    ? ({
        id: data.id,
        jurisdiction: data.jurisdiction,
        defaultModality: data.default_modality,
        professionalBody: data.professional_body,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      } as TherapistProfile)
    : null;
}

export async function upsertTherapistProfile(profile: TherapistProfileInsert) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapist_profiles")
    .upsert({
      id: profile.id,
      jurisdiction: profile.jurisdiction,
      default_modality: profile.defaultModality ?? null,
      professional_body: profile.professionalBody ?? null,
    })
    .select()
    .single();

  if (error) {
    handleSupabaseError(error, "upsert therapist profile");
  }
  return data;
}

// ============================================================
// Therapy session CRUD
// ============================================================

function mapRowToTherapySession(row: any): TherapySession {
  return {
    id: row.id,
    therapistId: row.therapist_id,
    clientId: row.client_id ?? null,
    chatId: row.chat_id ?? null,
    sessionDate: row.session_date,
    durationMinutes: row.duration_minutes ?? null,
    audioStoragePath: row.audio_storage_path ?? null,
    audioMimeType: row.audio_mime_type ?? null,
    transcriptionStatus: row.transcription_status,
    transcriptionProvider: row.transcription_provider ?? null,
    notesStatus: row.notes_status,
    deliveryMethod: row.delivery_method ?? null,
    recordingType: row.recording_type ?? "full_session",
    writtenNotes: row.written_notes ?? null,
    errorMessage: row.error_message ?? null,
    processingError: row.processing_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToTherapySessionWithClient(row: any): TherapySessionWithClient {
  return {
    ...mapRowToTherapySession(row),
    clientName: row.clients?.name ?? null,
  };
}

function mapRowToSessionSegment(row: any): SessionSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    segmentIndex: row.segment_index,
    speaker: row.speaker,
    content: row.content,
    startTimeMs: row.start_time_ms,
    endTimeMs: row.end_time_ms,
    confidence: row.confidence ?? null,
    createdAt: row.created_at,
  };
}

function mapRowToClinicalNote(row: any): ClinicalNote {
  return {
    id: row.id,
    sessionId: row.session_id ?? null,
    clientId: row.client_id ?? null,
    therapistId: row.therapist_id,
    noteFormat: row.note_format,
    content: row.content,
    status: row.status,
    generatedBy: row.generated_by,
    modelUsed: row.model_used ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToSessionConsent(row: any): SessionConsent {
  return {
    id: row.id,
    sessionId: row.session_id,
    consentType: row.consent_type,
    consentingParty: row.consenting_party,
    consented: row.consented,
    consentedAt: row.consented_at,
    withdrawnAt: row.withdrawn_at ?? null,
    consentMethod: row.consent_method,
    createdAt: row.created_at,
  };
}

export async function createTherapySession(
  session: TherapySessionInsert
): Promise<TherapySession> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("therapy_sessions")
      .insert({
        therapist_id: session.therapistId,
        client_id: session.clientId ?? null,
        chat_id: session.chatId ?? null,
        session_date: session.sessionDate,
        delivery_method: session.deliveryMethod ?? null,
        ...(session.recordingType
          ? { recording_type: session.recordingType }
          : {}),
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "create therapy session");
    }

    return mapRowToTherapySession(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create therapy session"
    );
  }
}

export async function getTherapySession({
  id,
}: {
  id: string;
}): Promise<TherapySession | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("therapy_sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      handleSupabaseError(error, "get therapy session");
    }

    return mapRowToTherapySession(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get therapy session"
    );
  }
}

export async function getTherapySessions({
  therapistId,
  clientId,
  limit = 50,
  offset = 0,
}: {
  therapistId: string;
  clientId?: string;
  limit?: number;
  offset?: number;
}): Promise<TherapySessionWithClient[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("therapy_sessions")
      .select("*, clients(name)")
      .eq("therapist_id", therapistId)
      .order("session_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data, error } = await query;

    if (error) {
      handleSupabaseError(error, "get therapy sessions");
    }

    return (data || []).map(mapRowToTherapySessionWithClient);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get therapy sessions"
    );
  }
}

export async function updateTherapySession({
  id,
  ...fields
}: { id: string } & Partial<
  Omit<TherapySession, "id" | "createdAt" | "updatedAt">
>): Promise<TherapySession> {
  try {
    const supabase = await createClient();

    const fieldMap: [string, string, unknown][] = [
      ["therapistId", "therapist_id", fields.therapistId],
      ["clientId", "client_id", fields.clientId],
      ["chatId", "chat_id", fields.chatId],
      ["sessionDate", "session_date", fields.sessionDate],
      ["durationMinutes", "duration_minutes", fields.durationMinutes],
      ["audioStoragePath", "audio_storage_path", fields.audioStoragePath],
      ["audioMimeType", "audio_mime_type", fields.audioMimeType],
      [
        "transcriptionStatus",
        "transcription_status",
        fields.transcriptionStatus,
      ],
      [
        "transcriptionProvider",
        "transcription_provider",
        fields.transcriptionProvider,
      ],
      ["notesStatus", "notes_status", fields.notesStatus],
      ["deliveryMethod", "delivery_method", fields.deliveryMethod],
      ["recordingType", "recording_type", fields.recordingType],
      ["writtenNotes", "written_notes", fields.writtenNotes],
      ["errorMessage", "error_message", fields.errorMessage],
      ["processingError", "processing_error", fields.processingError],
    ];

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const [camelKey, snakeKey, value] of fieldMap) {
      if ((fields as Record<string, unknown>)[camelKey] !== undefined) {
        updatePayload[snakeKey] = value;
      }
    }

    const { data, error } = await supabase
      .from("therapy_sessions")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "update therapy session");
    }

    return mapRowToTherapySession(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update therapy session"
    );
  }
}

export async function deleteTherapySession({
  id,
}: {
  id: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("therapy_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      handleSupabaseError(error, "delete therapy session");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete therapy session"
    );
  }
}

// ============================================================
// Transcript segments
// ============================================================

export async function insertSessionSegments(
  segments: SessionSegmentInsert[]
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("session_segments").insert(
      segments.map((s) => ({
        session_id: s.sessionId,
        segment_index: s.segmentIndex,
        speaker: s.speaker,
        content: s.content,
        start_time_ms: s.startTimeMs,
        end_time_ms: s.endTimeMs,
        confidence: s.confidence ?? null,
      }))
    );

    if (error) {
      handleSupabaseError(error, "insert session segments");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to insert session segments"
    );
  }
}

export async function getSessionSegments({
  sessionId,
}: {
  sessionId: string;
}): Promise<SessionSegment[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("session_segments")
      .select("*")
      .eq("session_id", sessionId)
      .order("segment_index", { ascending: true });

    if (error) {
      handleSupabaseError(error, "get session segments");
    }

    const segments = (data || []).map(mapRowToSessionSegment);

    // Option A: decrypt here so every caller gets plaintext automatically.
    // sessionId is already available from the function parameter.
    return decryptSegments(segments, sessionId);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get session segments"
    );
  }
}

function titleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export async function getSessionTranscriptText({
  sessionId,
  recordingType,
  writtenNotes,
}: {
  sessionId: string;
  recordingType?: RecordingType;
  writtenNotes?: string | null;
}): Promise<string> {
  if (recordingType === "written_notes") {
    return writtenNotes ?? "";
  }
  const segments = await getSessionSegments({ sessionId });
  if (recordingType === "therapist_summary") {
    return segments.map((s) => s.content).join("\n\n");
  }
  return segments
    .map((s) => `${titleCase(s.speaker)}: ${s.content}`)
    .join("\n\n");
}

// ============================================================
// Clinical notes
// ============================================================

export async function createClinicalNote(
  note: ClinicalNoteInsert
): Promise<ClinicalNote> {
  try {
    const supabase = await createClient();
    const noteId = randomUUID();
    const encryptedContent = await encryptJsonb(note.content, noteId);

    const { data, error } = await supabase
      .from("clinical_notes")
      .insert({
        id: noteId,
        session_id: note.sessionId ?? null,
        client_id: note.clientId ?? null,
        therapist_id: note.therapistId,
        note_format: note.noteFormat,
        content: encryptedContent,
        generated_by: note.generatedBy ?? "ai",
        model_used: note.modelUsed ?? null,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "create clinical note");
    }

    const mapped = mapRowToClinicalNote(data);
    mapped.content = note.content;
    return mapped;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create clinical note"
    );
  }
}

export async function getClinicalNotes({
  sessionId,
}: {
  sessionId: string;
}): Promise<ClinicalNote[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) {
      handleSupabaseError(error, "get clinical notes");
    }

    const notes = (data || []).map(mapRowToClinicalNote);
    await Promise.all(
      notes.map(async (note) => {
        note.content = await decryptJsonb(note.content, note.id);
      })
    );
    return notes;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get clinical notes"
    );
  }
}

export async function updateClinicalNote({
  id,
  content,
  status,
  reviewedAt,
}: {
  id: string;
  content?: NoteContent;
  status?: NoteStatus;
  reviewedAt?: string;
}): Promise<ClinicalNote> {
  try {
    const supabase = await createClient();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (content !== undefined) {
      updatePayload.content = await encryptJsonb(content, id);
    }
    if (status !== undefined) {
      updatePayload.status = status;
    }
    if (reviewedAt !== undefined) {
      updatePayload.reviewed_at = reviewedAt;
    }

    const { data, error } = await supabase
      .from("clinical_notes")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "update clinical note");
    }

    const mapped = mapRowToClinicalNote(data);
    mapped.content = await decryptJsonb(mapped.content, mapped.id);
    return mapped;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update clinical note"
    );
  }
}

export async function deleteClinicalNote({
  id,
}: {
  id: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clinical_notes")
      .delete()
      .eq("id", id);

    if (error) {
      handleSupabaseError(error, "delete clinical note");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete clinical note"
    );
  }
}

// ============================================================
// Consent records
// ============================================================

export async function recordSessionConsent(
  consent: SessionConsentInsert
): Promise<SessionConsent> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("session_consents")
      .upsert(
        {
          session_id: consent.sessionId,
          consent_type: consent.consentType,
          consenting_party: consent.consentingParty,
          consented: consent.consented,
          consented_at: new Date().toISOString(),
          consent_method: consent.consentMethod,
          ip_address: consent.ipAddress ?? null,
        },
        {
          onConflict: "session_id,consent_type,consenting_party",
        }
      )
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "record session consent");
    }

    return mapRowToSessionConsent(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to record session consent"
    );
  }
}

export async function getSessionConsents({
  sessionId,
}: {
  sessionId: string;
}): Promise<SessionConsent[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("session_consents")
      .select("*")
      .eq("session_id", sessionId);

    if (error) {
      handleSupabaseError(error, "get session consents");
    }

    return (data || []).map(mapRowToSessionConsent);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get session consents"
    );
  }
}

export async function hasRequiredConsents({
  sessionId,
  recordingType,
}: {
  sessionId: string;
  recordingType?: RecordingType;
}): Promise<boolean> {
  try {
    const consents = await getSessionConsents({ sessionId });

    const requiredPairs: [ConsentType, ConsentingParty][] =
      recordingType === "therapist_summary"
        ? [
            ["recording", "therapist"],
            ["ai_transcription", "therapist"],
            ["ai_note_generation", "therapist"],
            ["data_storage", "therapist"],
          ]
        : [
            ["recording", "therapist"],
            ["recording", "client"],
            ["ai_transcription", "therapist"],
            ["ai_transcription", "client"],
            ["ai_note_generation", "therapist"],
            ["ai_note_generation", "client"],
            ["data_storage", "therapist"],
            ["data_storage", "client"],
          ];

    return requiredPairs.every(([type, party]) =>
      consents.some(
        (c) =>
          c.consentType === type &&
          c.consentingParty === party &&
          c.consented &&
          c.withdrawnAt === null
      )
    );
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to check required consents"
    );
  }
}

export async function withdrawConsent({
  sessionId,
  consentType,
  consentingParty,
}: {
  sessionId: string;
  consentType: ConsentType;
  consentingParty: ConsentingParty;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("session_consents")
      .update({ withdrawn_at: new Date().toISOString() })
      .eq("session_id", sessionId)
      .eq("consent_type", consentType)
      .eq("consenting_party", consentingParty);

    if (error) {
      handleSupabaseError(error, "withdraw consent");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to withdraw consent"
    );
  }
}

// ============================================================
// Dashboard, clients list, and sidebar queries
// ============================================================

export async function getRecentSessions({
  therapistId,
  limit = 5,
}: {
  therapistId: string;
  limit?: number;
}): Promise<RecentSession[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("therapy_sessions")
      .select(
        "id, client_id, session_date, duration_minutes, transcription_status, notes_status, clients(name)"
      )
      .eq("therapist_id", therapistId)
      .order("session_date", { ascending: false })
      .limit(limit);

    if (error) {
      handleSupabaseError(error, "get recent sessions");
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      clientId: row.client_id ?? null,
      clientName: row.clients?.name ?? null,
      sessionDate: row.session_date,
      durationMinutes: row.duration_minutes ?? null,
      transcriptionStatus: row.transcription_status,
      notesStatus: row.notes_status,
    }));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get recent sessions"
    );
  }
}

export async function getSessionCountsByClient({
  therapistId,
}: {
  therapistId: string;
}): Promise<Record<string, number>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("therapy_sessions")
      .select("client_id")
      .eq("therapist_id", therapistId)
      .not("client_id", "is", null);

    if (error) {
      handleSupabaseError(error, "get session counts by client");
    }

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const cid = row.client_id as string;
      counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get session counts by client"
    );
  }
}

export async function getLastActivityByClient({
  therapistId,
}: {
  therapistId: string;
}): Promise<Record<string, Date>> {
  try {
    const supabase = await createClient();

    // Get most recent session date per client
    const { data: sessionData, error: sessionError } = await supabase
      .from("therapy_sessions")
      .select("client_id, session_date")
      .eq("therapist_id", therapistId)
      .not("client_id", "is", null);

    if (sessionError) {
      handleSupabaseError(sessionError, "get last activity (sessions)");
    }

    // Get most recent chat date per client
    const { data: chatData, error: chatError } = await supabase
      .from("Chat")
      .select("clientId, createdAt")
      .eq("userId", therapistId)
      .not("clientId", "is", null);

    if (chatError) {
      handleSupabaseError(chatError, "get last activity (chats)");
    }

    const latest: Record<string, Date> = {};

    for (const row of sessionData || []) {
      const cid = row.client_id as string;
      const d = new Date(row.session_date);
      if (!latest[cid] || d > latest[cid]) {
        latest[cid] = d;
      }
    }

    for (const row of chatData || []) {
      const cid = row.clientId as string;
      const d = new Date(row.createdAt);
      if (!latest[cid] || d > latest[cid]) {
        latest[cid] = d;
      }
    }

    return latest;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get last activity by client"
    );
  }
}

export async function getClinicalNotesByClient({
  clientId,
  therapistId,
}: {
  clientId: string;
  therapistId: string;
}): Promise<ClinicalNoteWithSession[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinical_notes")
      .select(
        "id, session_id, note_format, status, content, created_at, updated_at, therapy_sessions(session_date)"
      )
      .eq("therapist_id", therapistId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      handleSupabaseError(error, "get clinical notes by client");
    }

    const notes = (data || []).map((row: any) => ({
      id: row.id,
      sessionId: row.session_id ?? null,
      sessionDate: row.therapy_sessions?.session_date ?? null,
      noteFormat: row.note_format,
      status: row.status,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    await Promise.all(
      notes.map(async (note) => {
        note.content = await decryptJsonb(note.content, note.id);
      })
    );
    return notes;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get clinical notes by client"
    );
  }
}

export async function getRecentSessionsForSidebar({
  therapistId,
  limit = 5,
}: {
  therapistId: string;
  limit?: number;
}): Promise<SidebarSession[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("therapy_sessions")
      .select("id, client_id, session_date, clients(name)")
      .eq("therapist_id", therapistId)
      .order("session_date", { ascending: false })
      .limit(limit);

    if (error) {
      handleSupabaseError(error, "get recent sessions for sidebar");
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      clientId: row.client_id ?? null,
      clientName: row.clients?.name ?? null,
      sessionDate: row.session_date,
    }));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get recent sessions for sidebar"
    );
  }
}

// ── Clinical Document helpers ─────────────────────────────────────────

function mapRowToClinicalDocument(row: any): ClinicalDocument {
  return {
    id: row.id,
    clientId: row.client_id,
    therapistId: row.therapist_id,
    documentType: row.document_type,
    title: row.title,
    content: row.content,
    status: row.status,
    version: row.version,
    supersedesId: row.supersedes_id ?? null,
    generatedBy: row.generated_by,
    modelUsed: row.model_used ?? null,
    reviewedAt: row.reviewed_at ?? null,
    finalisedAt: row.finalised_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToClinicalDocumentReference(
  row: any
): ClinicalDocumentReference {
  return {
    id: row.id,
    documentId: row.document_id,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at,
  };
}

function mapRowToClinicalDocumentSummary(row: any): ClinicalDocumentSummary {
  return {
    id: row.id,
    documentType: row.document_type,
    title: row.title,
    status: row.status,
    version: row.version,
    supersedesId: row.supersedes_id ?? null,
    generatedBy: row.generated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Clinical Document queries ─────────────────────────────────────────

export async function createClinicalDocument(
  doc: ClinicalDocumentInsert
): Promise<ClinicalDocument> {
  try {
    const supabase = await createClient();
    const documentId = randomUUID();
    const encryptedContent = await encryptJsonb(doc.content, documentId);

    const { data, error } = await supabase
      .from("clinical_documents")
      .insert({
        id: documentId,
        client_id: doc.clientId,
        therapist_id: doc.therapistId,
        document_type: doc.documentType,
        title: doc.title,
        content: encryptedContent,
        status: doc.status ?? "draft",
        version: doc.version ?? 1,
        supersedes_id: doc.supersedesId ?? null,
        generated_by: doc.generatedBy,
        model_used: doc.modelUsed ?? null,
      })
      .select("*")
      .single();

    if (error) {
      handleSupabaseError(error, "create clinical document");
    }

    const mapped = mapRowToClinicalDocument(data);
    mapped.content = await decryptJsonb(mapped.content, mapped.id);
    return mapped;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create clinical document"
    );
  }
}

export async function getClinicalDocument({
  id,
  therapistId,
}: {
  id: string;
  therapistId: string;
}): Promise<ClinicalDocumentWithReferences | null> {
  try {
    const supabase = await createClient();

    const { data: docData, error: docError } = await supabase
      .from("clinical_documents")
      .select("*")
      .eq("id", id)
      .eq("therapist_id", therapistId)
      .single();

    if (docError) {
      if (docError.code === "PGRST116") {
        return null;
      }
      handleSupabaseError(docError, "get clinical document");
    }

    const { data: refsData, error: refsError } = await supabase
      .from("clinical_document_references")
      .select("*")
      .eq("document_id", id);

    if (refsError) {
      handleSupabaseError(refsError, "get clinical document references");
    }

    const mapped = mapRowToClinicalDocument(docData);
    mapped.content = await decryptJsonb(mapped.content, mapped.id);

    return {
      ...mapped,
      references: (refsData || []).map(mapRowToClinicalDocumentReference),
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get clinical document"
    );
  }
}

export async function getClinicalDocumentsByClient({
  clientId,
  therapistId,
}: {
  clientId: string;
  therapistId: string;
}): Promise<ClinicalDocumentSummary[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinical_documents")
      .select(
        "id, document_type, title, status, version, supersedes_id, generated_by, created_at, updated_at"
      )
      .eq("client_id", clientId)
      .eq("therapist_id", therapistId)
      .neq("status", "generating")
      .order("created_at", { ascending: false });

    if (error) {
      handleSupabaseError(error, "get clinical documents by client");
    }

    return (data || []).map(mapRowToClinicalDocumentSummary);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get clinical documents by client"
    );
  }
}

export async function getClinicalDocumentsByType({
  clientId,
  therapistId,
  documentType,
}: {
  clientId: string;
  therapistId: string;
  documentType: ClinicalDocumentType;
}): Promise<ClinicalDocumentSummary[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinical_documents")
      .select(
        "id, document_type, title, status, version, supersedes_id, generated_by, created_at, updated_at"
      )
      .eq("client_id", clientId)
      .eq("therapist_id", therapistId)
      .eq("document_type", documentType)
      .neq("status", "generating")
      .order("created_at", { ascending: false });

    if (error) {
      handleSupabaseError(error, "get clinical documents by type");
    }

    return (data || []).map(mapRowToClinicalDocumentSummary);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get clinical documents by type"
    );
  }
}

export async function updateClinicalDocument({
  id,
  therapistId,
  ...updates
}: {
  id: string;
  therapistId: string;
  title?: string;
  content?: Record<string, string>;
  status?: ClinicalDocumentStatus;
  reviewedAt?: string;
  finalisedAt?: string;
}): Promise<ClinicalDocument> {
  try {
    const supabase = await createClient();

    const updatePayload: Record<string, unknown> = {};

    if (updates.title !== undefined) {
      updatePayload.title = updates.title;
    }
    if (updates.content !== undefined) {
      updatePayload.content = await encryptJsonb(updates.content, id);
    }
    if (updates.status !== undefined) {
      updatePayload.status = updates.status;
      if (updates.status === "finalised" && updates.finalisedAt === undefined) {
        updatePayload.finalised_at = new Date().toISOString();
      }
    }
    if (updates.reviewedAt !== undefined) {
      updatePayload.reviewed_at = updates.reviewedAt;
    }
    if (updates.finalisedAt !== undefined) {
      updatePayload.finalised_at = updates.finalisedAt;
    }

    const { data, error } = await supabase
      .from("clinical_documents")
      .update(updatePayload)
      .eq("id", id)
      .eq("therapist_id", therapistId)
      .select("*")
      .single();

    if (error) {
      handleSupabaseError(error, "update clinical document");
    }

    const mapped = mapRowToClinicalDocument(data);
    mapped.content = await decryptJsonb(mapped.content, mapped.id);
    return mapped;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update clinical document"
    );
  }
}

export async function deleteClinicalDocument({
  id,
  therapistId,
}: {
  id: string;
  therapistId: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clinical_documents")
      .delete()
      .eq("id", id)
      .eq("therapist_id", therapistId);

    if (error) {
      handleSupabaseError(error, "delete clinical document");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete clinical document"
    );
  }
}

export async function addDocumentReferences(
  refs: Array<{
    documentId: string;
    referenceType: "session" | "clinical_note" | "clinical_document";
    referenceId: string;
  }>
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clinical_document_references")
      .upsert(
        refs.map((ref) => ({
          document_id: ref.documentId,
          reference_type: ref.referenceType,
          reference_id: ref.referenceId,
        })),
        { onConflict: "document_id,reference_type,reference_id" }
      );

    if (error) {
      handleSupabaseError(error, "add document references");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to add document references"
    );
  }
}

export async function getRecentClinicalNotesByClient({
  clientId,
  therapistId,
  limit = 10,
}: {
  clientId: string;
  therapistId: string;
  limit?: number;
}): Promise<ClinicalNoteWithSession[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinical_notes")
      .select(
        "id, session_id, note_format, status, content, created_at, updated_at, therapy_sessions(session_date)"
      )
      .eq("therapist_id", therapistId)
      .eq("client_id", clientId)
      .neq("status", "generating")
      .order("created_at", { ascending: false });

    if (error) {
      handleSupabaseError(error, "get recent clinical notes by client");
    }

    const notes = (data || [])
      .map((row: any) => ({
        id: row.id as string,
        sessionId: (row.session_id ?? null) as string | null,
        sessionDate: (row.therapy_sessions?.session_date ?? null) as
          | string
          | null,
        noteFormat: row.note_format as ClinicalNoteWithSession["noteFormat"],
        status: row.status as ClinicalNoteWithSession["status"],
        content: row.content as ClinicalNoteWithSession["content"],
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }))
      .sort((a, b) => {
        if (!a.sessionDate && !b.sessionDate) {
          return 0;
        }
        if (!a.sessionDate) {
          return 1;
        }
        if (!b.sessionDate) {
          return -1;
        }
        return b.sessionDate.localeCompare(a.sessionDate);
      })
      .slice(0, limit);

    await Promise.all(
      notes.map(async (note) => {
        note.content = await decryptJsonb(note.content, note.id);
      })
    );
    return notes;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get recent clinical notes by client"
    );
  }
}

export async function getClientSessionCount({
  clientId,
  therapistId,
}: {
  clientId: string;
  therapistId: string;
}): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("therapy_sessions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("therapist_id", therapistId);

    if (error) {
      handleSupabaseError(error, "get client session count");
    }

    return count ?? 0;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get client session count"
    );
  }
}

export async function getLatestDocumentByType({
  clientId,
  therapistId,
  documentType,
}: {
  clientId: string;
  therapistId: string;
  documentType: ClinicalDocumentType;
}): Promise<ClinicalDocument | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinical_documents")
      .select("*")
      .eq("client_id", clientId)
      .eq("therapist_id", therapistId)
      .eq("document_type", documentType)
      .is("supersedes_id", null)
      .neq("status", "generating")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      handleSupabaseError(error, "get latest document by type");
    }

    const mapped = mapRowToClinicalDocument(data);
    mapped.content = await decryptJsonb(mapped.content, mapped.id);
    return mapped;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get latest document by type"
    );
  }
}

// ── Custom Note Format queries ───────────────────────────────────────────

function mapRowToCustomNoteFormat(row: any): CustomNoteFormat {
  return {
    id: row.id,
    therapistId: row.therapist_id,
    name: row.name,
    slug: row.slug,
    sections: row.sections as CustomNoteFormatSection[],
    generalRules: row.general_rules ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCustomNoteFormats({
  therapistId,
}: {
  therapistId: string;
}): Promise<CustomNoteFormat[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("custom_note_formats")
      .select("*")
      .eq("therapist_id", therapistId)
      .order("created_at", { ascending: true });

    if (error) {
      handleSupabaseError(error, "get custom note formats");
    }

    return (data ?? []).map(mapRowToCustomNoteFormat);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get custom note formats"
    );
  }
}

export async function getCustomNoteFormat({
  id,
  therapistId,
}: {
  id: string;
  therapistId: string;
}): Promise<CustomNoteFormat | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("custom_note_formats")
      .select("*")
      .eq("id", id)
      .eq("therapist_id", therapistId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      handleSupabaseError(error, "get custom note format");
    }

    return mapRowToCustomNoteFormat(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get custom note format"
    );
  }
}

export async function createCustomNoteFormat(
  format: CustomNoteFormatInsert
): Promise<CustomNoteFormat> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("custom_note_formats")
      .insert({
        therapist_id: format.therapistId,
        name: format.name,
        slug: format.slug,
        sections: format.sections,
        general_rules: format.generalRules ?? null,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "create custom note format");
    }

    return mapRowToCustomNoteFormat(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create custom note format"
    );
  }
}

export async function updateCustomNoteFormat({
  id,
  therapistId,
  updates,
}: {
  id: string;
  therapistId: string;
  updates: CustomNoteFormatUpdate;
}): Promise<CustomNoteFormat> {
  try {
    const supabase = await createClient();

    const updatePayload: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      updatePayload.name = updates.name;
    }
    if (updates.slug !== undefined) {
      updatePayload.slug = updates.slug;
    }
    if (updates.sections !== undefined) {
      updatePayload.sections = updates.sections;
    }
    if (updates.generalRules !== undefined) {
      updatePayload.general_rules = updates.generalRules;
    }

    const { data, error } = await supabase
      .from("custom_note_formats")
      .update(updatePayload)
      .eq("id", id)
      .eq("therapist_id", therapistId)
      .select()
      .single();

    if (error) {
      handleSupabaseError(error, "update custom note format");
    }

    return mapRowToCustomNoteFormat(data);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update custom note format"
    );
  }
}

export async function deleteCustomNoteFormat({
  id,
  therapistId,
}: {
  id: string;
  therapistId: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("custom_note_formats")
      .delete()
      .eq("id", id)
      .eq("therapist_id", therapistId);

    if (error) {
      handleSupabaseError(error, "delete custom note format");
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete custom note format"
    );
  }
}

export async function countCustomNoteFormats({
  therapistId,
}: {
  therapistId: string;
}): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("custom_note_formats")
      .select("id", { count: "exact", head: true })
      .eq("therapist_id", therapistId);

    if (error) {
      handleSupabaseError(error, "count custom note formats");
    }

    return count ?? 0;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count custom note formats"
    );
  }
}
