"use server";

import { auth } from "@/lib/auth";
import {
  getClientsByUserId,
  getClinicalNotesByClient,
  getSessionSegments,
  getTherapistProfile,
  getTherapySessions,
} from "@/lib/db/queries";
import { decryptJsonb } from "@/lib/encryption/fields";
import { createClient } from "@/utils/supabase/server";

interface ExportSection<T> {
  data: T | null;
  error?: string;
}

// NOTE: For users with very large datasets (thousands of sessions/messages),
// this export may be slow. Consider pagination or streaming in future.

export async function exportUserData(): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Not authenticated." };
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  // Fetch all data sections in parallel where possible
  const [profile, clients, chats, sessions] = await Promise.all([
    fetchSection("profile", () => getTherapistProfile({ userId })),
    fetchSection("clients", () => getClientsByUserId({ userId })),
    fetchSection("chats", () => fetchAllChatsWithMessages(userId)),
    fetchSection("sessions", () => {
      return getTherapySessions({ therapistId: userId, limit: 10_000 });
    }),
  ]);

  // Fetch session-dependent data (segments for each session)
  const sessionsWithSegments = await fetchSection(
    "sessionsWithSegments",
    () => {
      if (!sessions.data) {
        return Promise.resolve([]);
      }
      return Promise.all(
        sessions.data.map(async (s) => {
          try {
            const segments = await getSessionSegments({ sessionId: s.id });
            return {
              ...stripInternalFields({ ...s }),
              segments: segments.map((seg) => stripInternalFields({ ...seg })),
            };
          } catch {
            return {
              ...stripInternalFields({ ...s }),
              segments: [],
              _segmentsError: "Failed to decrypt or fetch segments",
            };
          }
        })
      );
    }
  );

  // Fetch clinical notes and documents per client
  const clinicalNotes = await fetchSection("clinicalNotes", async () => {
    if (!clients.data) {
      return [];
    }
    const allNotes = await Promise.all(
      clients.data.map(async (client) => {
        try {
          const notes = await getClinicalNotesByClient({
            clientId: client.id,
            therapistId: userId,
          });
          return notes.map((note) => ({
            ...stripInternalFields({ ...note }),
            clientName: client.name,
          }));
        } catch {
          return [
            {
              _error: `Failed to fetch notes for client ${client.name}`,
            },
          ];
        }
      })
    );
    return allNotes.flat();
  });

  const clinicalDocuments = await fetchSection(
    "clinicalDocuments",
    async () => {
      if (!clients.data) {
        return [];
      }
      const supabase = await createClient();
      const allDocs = await Promise.all(
        clients.data.map(async (client) => {
          try {
            // Fetch full documents with content (not just summaries)
            const { data, error } = await supabase
              .from("clinical_documents")
              .select("*")
              .eq("client_id", client.id)
              .eq("therapist_id", userId)
              .order("created_at", { ascending: false });

            if (error) {
              return [{ _error: `Failed for client ${client.name}` }];
            }

            const docs = await Promise.all(
              (data ?? []).map(async (row) => {
                const content = await decryptJsonb(row.content, row.id);
                return {
                  id: row.id,
                  clientName: client.name,
                  documentType: row.document_type,
                  title: row.title,
                  content,
                  status: row.status,
                  version: row.version,
                  generatedBy: row.generated_by,
                  createdAt: row.created_at,
                  updatedAt: row.updated_at,
                  reviewedAt: row.reviewed_at,
                  finalisedAt: row.finalised_at,
                };
              })
            );
            return docs;
          } catch {
            return [
              {
                _error: `Failed to fetch documents for client ${client.name}`,
              },
            ];
          }
        })
      );
      return allDocs.flat();
    }
  );

  const exportData = {
    exportDate: new Date().toISOString(),
    userId,
    email: userEmail,
    profile: profile.data
      ? stripInternalFields({ ...profile.data })
      : profile.error
        ? { _error: profile.error }
        : null,
    clients: clients.data
      ? clients.data.map((c) => stripInternalFields({ ...c }))
      : clients.error
        ? { _error: clients.error }
        : [],
    chats: chats.data ?? (chats.error ? { _error: chats.error } : []),
    sessions:
      sessionsWithSegments.data ??
      (sessionsWithSegments.error
        ? { _error: sessionsWithSegments.error }
        : []),
    clinicalNotes:
      clinicalNotes.data ??
      (clinicalNotes.error ? { _error: clinicalNotes.error } : []),
    clinicalDocuments:
      clinicalDocuments.data ??
      (clinicalDocuments.error ? { _error: clinicalDocuments.error } : []),
  };

  return {
    success: true,
    data: JSON.stringify(exportData, null, 2),
  };
}

async function fetchSection<T>(
  name: string,
  fetcher: () => Promise<T>
): Promise<ExportSection<T>> {
  try {
    const data = await fetcher();
    return { data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : `Failed to fetch ${name}`;
    return { data: null, error: message };
  }
}

async function fetchAllChatsWithMessages(userId: string) {
  const supabase = await createClient();

  // Fetch all chats for the user
  const { data: chats, error: chatsError } = await supabase
    .from("Chat")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false });

  if (chatsError) {
    throw new Error("Failed to fetch chats");
  }

  // Fetch messages for each chat with decryption
  const chatsWithMessages = await Promise.all(
    (chats ?? []).map(async (chat) => {
      try {
        const { data: messages, error: msgError } = await supabase
          .from("Message_v2")
          .select("*")
          .eq("chatId", chat.id)
          .order("createdAt", { ascending: true });

        if (msgError) {
          return {
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            clientId: chat.clientId,
            messages: [] as Record<string, unknown>[],
            _messagesError: "Failed to fetch messages",
          };
        }

        const decryptedMessages = await Promise.all(
          (messages ?? []).map(async (msg) => {
            try {
              const parts = await decryptJsonb(msg.parts, msg.id);
              return {
                id: msg.id,
                role: msg.role,
                parts,
                createdAt: msg.createdAt,
              };
            } catch {
              return {
                id: msg.id,
                role: msg.role,
                parts: "[decryption failed]",
                createdAt: msg.createdAt,
              };
            }
          })
        );

        return {
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          clientId: chat.clientId,
          messages: decryptedMessages,
        };
      } catch {
        return {
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          clientId: chat.clientId,
          messages: [],
          _messagesError: "Failed to fetch messages",
        };
      }
    })
  );

  return chatsWithMessages;
}

/**
 * Remove internal system fields that shouldn't be in the export.
 * Keeps user-owned data, strips therapistId (it's the userId, redundant).
 */
function stripInternalFields(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const { therapistId, ...rest } = obj;
  return rest;
}
