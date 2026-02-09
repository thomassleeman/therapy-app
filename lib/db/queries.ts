import "server-only";

import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { createClient } from "@/utils/supabase/server";
import { ChatSDKError } from "../errors";
import type {
  Chat,
  Client,
  DBMessage,
  Document,
  Suggestion,
  Vote,
} from "./types";

// Re-export types for backward compatibility
export type {
  Chat,
  Client,
  DBMessage,
  Document,
  Suggestion,
  Vote,
} from "./types";

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
  visibility: VisibilityType;
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

    if (error) handleSupabaseError(error, "save chat");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "delete chat by id");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "delete all chats by user id");
    return { deletedCount: data?.length ?? 0 };
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get chats by user id");

    const chats = filteredChats as Chat[];
    const hasMore = chats.length > limit;

    return {
      chats: hasMore ? chats.slice(0, limit) : chats,
      hasMore,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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
      if (error.code === "PGRST116") return null;
      handleSupabaseError(error, "get chat by id");
    }

    return data as Chat;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "save messages");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "update message");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get messages by chat id");
    return data as DBMessage[];
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "vote message");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get votes by chat id");
    return data as Vote[];
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "save document");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get documents by id");
    return data as Document[];
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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
      if (error.code === "PGRST116") return null;
      handleSupabaseError(error, "get document by id");
    }
    return data as Document;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error)
      handleSupabaseError(error, "delete documents by id after timestamp");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "save suggestions");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get suggestions by document id");
    return data as Suggestion[];
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get message by id");
    return data as DBMessage[];
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (selectError) handleSupabaseError(selectError, "get messages to delete");

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

      if (deleteError) handleSupabaseError(deleteError, "delete messages");
    }

    return { deleted: messageIds.length };
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("Chat")
      .update({ visibility })
      .eq("id", chatId)
      .select();

    if (error) handleSupabaseError(error, "update chat visibility by id");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
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

      if (chatError)
        handleSupabaseError(chatError, "get user chats for message count");

      if (!userChats || userChats.length === 0) return 0;

      const chatIds = userChats.map((c) => c.id);

      const { count, error: countError } = await supabase
        .from("Message_v2")
        .select("*", { count: "exact", head: true })
        .in("chatId", chatIds)
        .eq("role", "user")
        .gte("createdAt", timeThreshold);

      if (countError) handleSupabaseError(countError, "count messages");

      return count ?? 0;
    }

    return data ?? 0;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "create stream id");
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get stream ids by chat id");
    return (data || []).map(({ id }) => id);
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get clients by user id");

    // Map snake_case to camelCase
    return (data || []).map((client) => ({
      id: client.id,
      therapistId: client.therapist_id,
      name: client.name,
      background: client.background,
      createdAt: client.created_at,
      updatedAt: client.updated_at,
    })) as Client[];
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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
      if (error.code === "PGRST116") return null;
      handleSupabaseError(error, "get client by id");
    }

    return {
      id: data.id,
      therapistId: data.therapist_id,
      name: data.name,
      background: data.background,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } as Client;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get client by id"
    );
  }
}

export async function createClientRecord({
  therapistId,
  name,
  background,
}: {
  therapistId: string;
  name: string;
  background?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .insert({
        therapist_id: therapistId,
        name,
        background: background ?? null,
      })
      .select()
      .single();

    if (error) handleSupabaseError(error, "create client");

    return {
      id: data.id,
      therapistId: data.therapist_id,
      name: data.name,
      background: data.background,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } as Client;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError("bad_request:database", "Failed to create client");
  }
}

export async function updateClientById({
  id,
  name,
  background,
}: {
  id: string;
  name: string;
  background?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .update({
        name,
        background: background ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) handleSupabaseError(error, "update client by id");

    return {
      id: data.id,
      therapistId: data.therapist_id,
      name: data.name,
      background: data.background,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } as Client;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "delete client by id");
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get chats by client id");
    return data as Chat[];
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
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

    if (error) handleSupabaseError(error, "get chat counts by client");

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
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chat counts by client"
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

    if (error) handleSupabaseError(error, "update chat client by id");
    return data;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat client by id"
    );
  }
}
