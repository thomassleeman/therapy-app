import type {
  Client,
  DBMessage,
  SessionConsent,
  SessionSegment,
  TherapySession,
} from "@/lib/db/types";

export const mockClient: Client = {
  id: "client-001",
  therapistId: "therapist-001",
  name: "Test Client A",
  background: "Referred by GP for anxiety-related difficulties.",
  therapeuticModalities: ["CBT", "Person-Centred"],
  presentingIssues: "Generalised anxiety, work-related stress",
  treatmentGoals: "Develop coping strategies, reduce avoidance behaviours",
  riskConsiderations: null,
  status: "active",
  sessionFrequency: "weekly",
  deliveryMethod: "in-person",
  therapyStartDate: "2025-09-01",
  referralSource: "GP",
  ageBracket: "adult",
  sessionDurationMinutes: 50,
  contractedSessions: 12,
  feePerSession: null,
  supervisorNotes: null,
  tags: ["anxiety", "workplace"],
  createdAt: "2025-09-01T10:00:00Z",
  updatedAt: "2025-12-15T14:30:00Z",
};

export const mockSession: TherapySession = {
  id: "session-001",
  therapistId: "therapist-001",
  clientId: "client-001",
  chatId: null,
  sessionDate: "2025-12-10",
  durationMinutes: 50,
  audioStoragePath: null,
  transcriptionStatus: "completed",
  transcriptionProvider: "deepgram",
  notesStatus: "draft",
  deliveryMethod: "in-person",
  recordingType: "therapist_summary",
  errorMessage: null,
  createdAt: "2025-12-10T09:00:00Z",
  updatedAt: "2025-12-10T10:05:00Z",
};

export const mockChatMessages: DBMessage[] = [
  {
    id: "msg-001",
    chatId: "chat-001",
    role: "user",
    parts: [
      {
        type: "text",
        text: "I had a session with a client today who presented with increased anxiety around work deadlines.",
      },
    ],
    attachments: [],
    createdAt: "2025-12-10T11:00:00Z",
  },
  {
    id: "msg-002",
    chatId: "chat-001",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "It sounds like your client is experiencing heightened anxiety in response to work pressures. What therapeutic approaches have you been using to explore this with them?",
      },
    ],
    attachments: [],
    createdAt: "2025-12-10T11:00:05Z",
  },
  {
    id: "msg-003",
    chatId: "chat-001",
    role: "user",
    parts: [
      {
        type: "text",
        text: "We have been using CBT to identify automatic thoughts and cognitive distortions.",
      },
    ],
    attachments: [],
    createdAt: "2025-12-10T11:01:00Z",
  },
  {
    id: "msg-004",
    chatId: "chat-001",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "That sounds like a solid approach. Have you noticed any patterns in the automatic thoughts your client reports? Sometimes recurring themes can point toward underlying core beliefs worth exploring.",
      },
    ],
    attachments: [],
    createdAt: "2025-12-10T11:01:05Z",
  },
];

export const mockConsents: SessionConsent[] = [
  {
    id: "consent-001",
    sessionId: "session-001",
    consentType: "recording",
    consentingParty: "client",
    consented: true,
    consentedAt: "2025-12-10T08:55:00Z",
    withdrawnAt: null,
    consentMethod: "verbal",
    createdAt: "2025-12-10T08:55:00Z",
  },
  {
    id: "consent-002",
    sessionId: "session-001",
    consentType: "ai_transcription",
    consentingParty: "client",
    consented: true,
    consentedAt: "2025-12-10T08:55:00Z",
    withdrawnAt: null,
    consentMethod: "verbal",
    createdAt: "2025-12-10T08:55:00Z",
  },
  {
    id: "consent-003",
    sessionId: "session-001",
    consentType: "data_storage",
    consentingParty: "therapist",
    consented: true,
    consentedAt: "2025-12-10T08:50:00Z",
    withdrawnAt: null,
    consentMethod: "written",
    createdAt: "2025-12-10T08:50:00Z",
  },
];

export const mockTranscriptSegments: SessionSegment[] = [
  {
    id: "seg-001",
    sessionId: "session-001",
    segmentIndex: 0,
    speaker: "therapist",
    content:
      "How have things been since our last session? You mentioned feeling anxious about an upcoming deadline.",
    startTimeMs: 0,
    endTimeMs: 8500,
    confidence: 0.95,
    createdAt: "2025-12-10T09:01:00Z",
  },
  {
    id: "seg-002",
    sessionId: "session-001",
    segmentIndex: 1,
    speaker: "client",
    content:
      "It has been quite difficult actually. The deadline passed but I still feel on edge about the next one.",
    startTimeMs: 9000,
    endTimeMs: 16_200,
    confidence: 0.92,
    createdAt: "2025-12-10T09:01:00Z",
  },
  {
    id: "seg-003",
    sessionId: "session-001",
    segmentIndex: 2,
    speaker: "therapist",
    content:
      "That anticipatory anxiety can be really challenging. What thoughts come up when you think about the next deadline?",
    startTimeMs: 17_000,
    endTimeMs: 24_800,
    confidence: 0.97,
    createdAt: "2025-12-10T09:01:00Z",
  },
];
