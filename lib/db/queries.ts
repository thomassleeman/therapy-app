import "server-only";

import type { ArtifactKind } from "@/components/artifact";
import { createClient } from "@/utils/supabase/server";
import { ChatSDKError } from "../errors";
import type {
  Chat,
  Client,
  ClientInsert,
  ClientTag,
  DBMessage,
  Document,
  HybridSearchResult,
  Suggestion,
  TherapistProfile,
  TherapistProfileInsert,
  Vote,
} from "./types";

// Re-export types for backward compatibility
export type {
  Chat,
  Client,
  ClientTag,
  DBMessage,
  Document,
  HybridSearchResult,
  Suggestion,
  TherapistProfile,
  TherapistProfileInsert,
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
    sessionDurationMinutes: row.session_duration_minutes ?? null,
    contractedSessions: row.contracted_sessions ?? null,
    feePerSession:
      row.fee_per_session != null ? Number(row.fee_per_session) : null,
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
}: {
  id: string;
  userId: string;
  title: string;
  visibility: "private" | "public";
  clientId?: string | null;
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
    const { data, error } = await supabase
      .from("Message_v2")
      .insert(
        messages.map((msg) => ({
          id: msg.id,
          chatId: msg.chatId,
          role: msg.role,
          parts: msg.parts,
          attachments: msg.attachments,
          createdAt: msg.createdAt,
        }))
      )
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
    const { data, error } = await supabase
      .from("Message_v2")
      .update({ parts })
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
    return data as DBMessage[];
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

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Vote_v2")
      .upsert(
        {
          chatId,
          messageId,
          isUpvoted: type === "up",
        },
        {
          onConflict: "chatId,messageId",
        }
      )
      .select();

    if (error) {
      handleSupabaseError(error, "vote message");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Vote_v2")
      .select("*")
      .eq("chatId", id);

    if (error) {
      handleSupabaseError(error, "get votes by chat id");
    }
    return data as Vote[];
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get votes by chat id"
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

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Suggestion")
      .insert(
        suggestions.map((s) => ({
          id: s.id,
          documentId: s.documentId,
          documentCreatedAt: s.documentCreatedAt,
          originalText: s.originalText,
          suggestedText: s.suggestedText,
          description: s.description,
          isResolved: s.isResolved,
          userId: s.userId,
          createdAt: s.createdAt,
        }))
      )
      .select();

    if (error) {
      handleSupabaseError(error, "save suggestions");
    }
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Suggestion")
      .select("*")
      .eq("documentId", documentId);

    if (error) {
      handleSupabaseError(error, "get suggestions by document id");
    }
    return data as Suggestion[];
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get suggestions by document id"
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
    return data as DBMessage[];
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
