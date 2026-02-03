// Database types for Supabase
// These types mirror the database schema

export type VisibilityType = "public" | "private";
export type ArtifactKind = "text" | "code" | "image" | "sheet";
export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Chat {
  id: string;
  createdAt: string;
  title: string;
  userId: string;
  visibility: VisibilityType;
}

export interface DBMessage {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments: unknown;
  createdAt: string;
}

export interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

export interface Document {
  id: string;
  createdAt: string;
  title: string;
  content: string | null;
  kind: ArtifactKind;
  userId: string;
}

export interface Suggestion {
  id: string;
  documentId: string;
  documentCreatedAt: string;
  originalText: string;
  suggestedText: string;
  description: string | null;
  isResolved: boolean;
  userId: string;
  createdAt: string;
}

export interface Stream {
  id: string;
  chatId: string;
  createdAt: string;
}

// Insert types (for creating new records)
export interface ChatInsert {
  id?: string;
  createdAt?: string;
  title: string;
  userId: string;
  visibility?: VisibilityType;
}

export interface DBMessageInsert {
  id?: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments: unknown;
  createdAt?: string;
}

export interface VoteInsert {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

export interface DocumentInsert {
  id?: string;
  createdAt?: string;
  title: string;
  content?: string | null;
  kind?: ArtifactKind;
  userId: string;
}

export interface SuggestionInsert {
  id?: string;
  documentId: string;
  documentCreatedAt: string;
  originalText: string;
  suggestedText: string;
  description?: string | null;
  isResolved?: boolean;
  userId: string;
  createdAt?: string;
}

export interface StreamInsert {
  id?: string;
  chatId: string;
  createdAt?: string;
}
