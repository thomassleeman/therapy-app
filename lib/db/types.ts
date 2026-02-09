// Database types for Supabase
// These types mirror the database schema

export type VisibilityType = "public" | "private";
export type ArtifactKind = "text";
export type MessageRole = "user" | "assistant" | "system" | "tool";

// Client enum values — used at runtime for form dropdowns and at type level
export const CLIENT_STATUSES = [
  "active",
  "paused",
  "discharged",
  "waitlisted",
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const SESSION_FREQUENCIES = [
  "weekly",
  "fortnightly",
  "monthly",
  "ad-hoc",
] as const;
export type SessionFrequency = (typeof SESSION_FREQUENCIES)[number];

export const DELIVERY_METHODS = [
  "in-person",
  "online",
  "telephone",
  "hybrid",
] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const AGE_BRACKETS = [
  "child",
  "adolescent",
  "young-adult",
  "adult",
  "older-adult",
] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

// Display labels for enum values
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Active",
  paused: "Paused",
  discharged: "Discharged",
  waitlisted: "Waitlisted",
};

export const SESSION_FREQUENCY_LABELS: Record<SessionFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  "ad-hoc": "Ad-hoc",
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  "in-person": "In-person",
  online: "Online",
  telephone: "Telephone",
  hybrid: "Hybrid",
};

export const AGE_BRACKET_LABELS: Record<AgeBracket, string> = {
  child: "Child (under 12)",
  adolescent: "Adolescent (12–17)",
  "young-adult": "Young adult (18–25)",
  adult: "Adult (26–64)",
  "older-adult": "Older adult (65+)",
};

// Common therapeutic modalities for suggestions
export const COMMON_MODALITIES = [
  "CBT",
  "Person-Centred",
  "Psychodynamic",
  "Integrative",
  "Systemic",
  "EMDR",
  "DBT",
  "ACT",
  "CFT",
  "Existential",
  "Gestalt",
  "Solution-Focused",
  "Narrative",
] as const;

export interface Chat {
  id: string;
  createdAt: string;
  title: string;
  userId: string;
  visibility: VisibilityType;
  clientId: string | null;
}

export interface Client {
  id: string;
  therapistId: string;
  name: string;
  background: string | null;
  // Therapeutic approach
  therapeuticModalities: string[];
  // Clinical context
  presentingIssues: string | null;
  treatmentGoals: string | null;
  riskConsiderations: string | null;
  // Practice management
  status: ClientStatus;
  sessionFrequency: SessionFrequency | null;
  deliveryMethod: DeliveryMethod | null;
  therapyStartDate: string | null;
  referralSource: string | null;
  ageBracket: AgeBracket | null;
  // Contract details
  sessionDurationMinutes: number | null;
  contractedSessions: number | null;
  feePerSession: number | null;
  // Professional notes
  supervisorNotes: string | null;
  // Tags (populated from join)
  tags?: string[];
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface ClientTag {
  id: string;
  therapistId: string;
  name: string;
  createdAt: string;
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
  clientId?: string | null;
}

export interface ClientInsert {
  id?: string;
  therapistId: string;
  name: string;
  background?: string | null;
  therapeuticModalities?: string[];
  presentingIssues?: string | null;
  treatmentGoals?: string | null;
  riskConsiderations?: string | null;
  status?: ClientStatus;
  sessionFrequency?: SessionFrequency | null;
  deliveryMethod?: DeliveryMethod | null;
  therapyStartDate?: string | null;
  referralSource?: string | null;
  ageBracket?: AgeBracket | null;
  sessionDurationMinutes?: number | null;
  contractedSessions?: number | null;
  feePerSession?: number | null;
  supervisorNotes?: string | null;
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
