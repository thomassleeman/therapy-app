// Database types for Supabase
// These types mirror the database schema

import type {
  ClinicalDocumentStatus,
  ClinicalDocumentType,
} from "@/lib/documents/types";
import { JURISDICTIONS, type Jurisdiction } from "@/lib/types/knowledge";

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
  sessionId: string | null;
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

// RAG knowledge base types

export const DOCUMENT_CATEGORIES = [
  "legislation",
  "guideline",
  "therapeutic_content",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  sourceUrl: string | null;
  version: string | null;
  source: string;
  modality: string | null;
  jurisdiction: Jurisdiction | null;
  supersededBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[] | null;
  chunkIndex: number;
  modality: string | null;
  jurisdiction: Jurisdiction | null;
  documentType: DocumentCategory;
  sectionPath: string | null;
  metadata: Record<string, unknown>;
  parentChunkId: string | null;
  createdAt: string;
}

export const THERAPIST_JURISDICTIONS = JURISDICTIONS;
export type TherapistJurisdiction = Jurisdiction;

export interface TherapistProfile {
  id: string;
  jurisdiction: Jurisdiction;
  defaultModality: string | null;
  professionalBody: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TherapistProfileInsert {
  id: string;
  jurisdiction: Jurisdiction;
  defaultModality?: string | null;
  professionalBody?: string | null;
}

export interface HybridSearchResult {
  id: string;
  content: string;
  documentId: string;
  sectionPath: string | null;
  documentTitle: string;
  modality: string[] | null;
  jurisdiction: string | null;
  documentType: DocumentCategory;
  metadata: Record<string, unknown>;
  similarityScore: number;
  combinedRrfScore: number;
}

// Insert types (for creating new records)
export interface ChatInsert {
  id?: string;
  createdAt?: string;
  title: string;
  userId: string;
  visibility?: VisibilityType;
  clientId?: string | null;
  sessionId?: string | null;
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

export interface KnowledgeDocumentInsert {
  id?: string;
  title: string;
  category: DocumentCategory;
  sourceUrl?: string | null;
  version?: string | null;
  source: string;
  modality?: string | null;
  jurisdiction?: Jurisdiction | null;
  supersededBy?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface KnowledgeChunkInsert {
  id?: string;
  documentId: string;
  content: string;
  embedding?: number[] | null;
  chunkIndex: number;
  modality?: string | null;
  jurisdiction?: Jurisdiction | null;
  documentType: DocumentCategory;
  sectionPath?: string | null;
  metadata?: Record<string, unknown>;
  parentChunkId?: string | null;
  createdAt?: string;
}

// ── Session transcription types ──────────────────────────────────────────

export const SESSION_TRANSCRIPTION_STATUSES = [
  "pending",
  "uploading",
  "transcribing",
  "labelling",
  "completed",
  "failed",
] as const;
export type TranscriptionStatus =
  (typeof SESSION_TRANSCRIPTION_STATUSES)[number];

export const TRANSCRIPTION_STATUS_LABELS: Record<TranscriptionStatus, string> =
  {
    pending: "Pending",
    uploading: "Uploading",
    transcribing: "Transcribing",
    labelling: "Labelling",
    completed: "Completed",
    failed: "Failed",
  };

export const NOTE_FORMATS = [
  "soap",
  "dap",
  "birp",
  "girp",
  "narrative",
] as const;
export type NoteFormat = (typeof NOTE_FORMATS)[number];

export const NOTE_STATUSES = ["draft", "reviewed", "finalised"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const CONSENT_TYPES = [
  "recording",
  "ai_transcription",
  "ai_note_generation",
  "data_storage",
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENTING_PARTIES = ["therapist", "client"] as const;
export type ConsentingParty = (typeof CONSENTING_PARTIES)[number];

export const RECORDING_TYPES = ["full_session", "therapist_summary"] as const;
export type RecordingType = (typeof RECORDING_TYPES)[number];

export interface TherapySession {
  id: string;
  therapistId: string;
  clientId: string | null;
  chatId: string | null;
  sessionDate: string;
  durationMinutes: number | null;
  audioStoragePath: string | null;
  transcriptionStatus: TranscriptionStatus;
  transcriptionProvider: string | null;
  notesStatus: string;
  deliveryMethod: string | null;
  recordingType: RecordingType;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TherapySessionWithClient extends TherapySession {
  clientName: string | null;
}

export interface SessionSegment {
  id: string;
  sessionId: string;
  segmentIndex: number;
  speaker: string;
  content: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number | null;
  createdAt: string;
}

export interface SoapNoteContent {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface DapNoteContent {
  data: string;
  assessment: string;
  plan: string;
}

export interface BirpNoteContent {
  behaviour: string;
  intervention: string;
  response: string;
  plan: string;
}

export interface GirpNoteContent {
  goals: string;
  intervention: string;
  response: string;
  plan: string;
}

export interface NarrativeNoteContent {
  clinicalOpening: string;
  sessionBody: string;
  clinicalSynthesis: string;
  pathForward: string;
}

/** Internal fallback type used when structured parsing fails */
export interface FreeformNoteContent {
  body: string;
}

export type NoteContent =
  | SoapNoteContent
  | DapNoteContent
  | BirpNoteContent
  | GirpNoteContent
  | NarrativeNoteContent
  | FreeformNoteContent;

export interface ClinicalNote {
  id: string;
  sessionId: string | null;
  clientId: string | null;
  therapistId: string;
  noteFormat: NoteFormat;
  content: NoteContent;
  status: NoteStatus;
  generatedBy: string;
  modelUsed: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionConsent {
  id: string;
  sessionId: string;
  consentType: ConsentType;
  consentingParty: ConsentingParty;
  consented: boolean;
  consentedAt: string;
  withdrawnAt: string | null;
  consentMethod: string;
  createdAt: string;
}

// ── Session transcription insert types ───────────────────────────────────

export interface TherapySessionInsert {
  therapistId: string;
  clientId?: string | null;
  chatId?: string | null;
  sessionDate: string;
  deliveryMethod?: string | null;
  recordingType?: RecordingType;
}

export interface SessionSegmentInsert {
  sessionId: string;
  segmentIndex: number;
  speaker: string;
  content: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number | null;
}

export interface ClinicalNoteInsert {
  sessionId?: string | null;
  clientId?: string | null;
  therapistId: string;
  noteFormat: NoteFormat;
  content: NoteContent;
  generatedBy?: string;
  modelUsed?: string | null;
}

export interface SessionConsentInsert {
  sessionId: string;
  consentType: ConsentType;
  consentingParty: ConsentingParty;
  consented: boolean;
  consentMethod: string;
  ipAddress?: string | null;
}

// ── Dashboard / sidebar / clients list query result types ─────────────

export interface RecentSession {
  id: string;
  clientId: string | null;
  clientName: string | null;
  sessionDate: string;
  durationMinutes: number | null;
  transcriptionStatus: TranscriptionStatus;
  notesStatus: string;
}

export interface SidebarSession {
  id: string;
  clientId: string | null;
  clientName: string | null;
  sessionDate: string;
}

export interface ClinicalNoteWithSession {
  id: string;
  sessionId: string | null;
  sessionDate: string | null;
  noteFormat: NoteFormat;
  status: NoteStatus;
  content: NoteContent;
  createdAt: string;
  updatedAt: string;
}

// ── Clinical Document types ──────────────────────────────────────────

export interface ClinicalDocument {
  id: string;
  clientId: string;
  therapistId: string;
  documentType: ClinicalDocumentType;
  title: string;
  content: Record<string, string>; // section key → section text
  status: ClinicalDocumentStatus;
  version: number;
  supersedesId: string | null;
  generatedBy: "ai" | "manual";
  modelUsed: string | null;
  reviewedAt: string | null;
  finalisedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalDocumentInsert {
  clientId: string;
  therapistId: string;
  documentType: ClinicalDocumentType;
  title: string;
  content: Record<string, string>;
  status?: ClinicalDocumentStatus;
  version?: number;
  supersedesId?: string | null;
  generatedBy: "ai" | "manual";
  modelUsed?: string | null;
}

export interface ClinicalDocumentReference {
  id: string;
  documentId: string;
  referenceType: "session" | "clinical_note" | "clinical_document";
  referenceId: string;
  createdAt: string;
}

export interface ClinicalDocumentWithReferences extends ClinicalDocument {
  references: ClinicalDocumentReference[];
}

/** Lightweight type for document lists in the client hub */
export interface AccountDeletionRequest {
  id: string;
  userId: string;
  userEmail: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  requestedAt: string;
  executeAfter: string;
  completedAt: string | null;
  errorMessage: string | null;
  auditLog: Array<{ action: string; timestamp: string; details?: string }>;
}

export interface ClinicalDocumentSummary {
  id: string;
  documentType: ClinicalDocumentType;
  title: string;
  status: ClinicalDocumentStatus;
  version: number;
  supersedesId: string | null;
  generatedBy: "ai" | "manual";
  createdAt: string;
  updatedAt: string;
}
