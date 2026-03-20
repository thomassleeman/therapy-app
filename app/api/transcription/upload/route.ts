import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getTherapySession,
  hasRequiredConsents,
  updateTherapySession,
} from "@/lib/db/queries";
import { encryptBuffer } from "@/lib/encryption/crypto";
import { createClient } from "@/utils/supabase/server";

const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav", // Safari reports WAV files with this non-standard type
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a", // Some systems report M4A files with this non-standard type
  "audio/mpeg",
  // audio/mp3 removed — non-standard IANA type, client never sends it
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * Normalise non-standard MIME types to their IANA-registered equivalents.
 * Runs AFTER codec parameter stripping and AFTER validation, so that
 * non-standard types pass the allowlist check but downstream consumers
 * (Supabase Storage, database column, transcription providers) only
 * receive standard types.
 */
function normaliseMimeType(baseType: string): string {
  const NORMALISATION_MAP: Record<string, string> = {
    "audio/x-wav": "audio/wav",
    "audio/x-m4a": "audio/mp4",
  };
  return NORMALISATION_MAP[baseType] ?? baseType;
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
  };
  return map[mimeType] ?? "bin";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audioFile") as Blob | null;
    const sessionId = formData.get("sessionId") as string | null;

    if (!audioFile || !sessionId) {
      return NextResponse.json(
        { error: "Missing audioFile or sessionId" },
        { status: 400 }
      );
    }

    // Validate file type (strip codec params like "audio/webm;codecs=opus")
    const baseType = audioFile.type.split(";")[0].trim();
    if (!ACCEPTED_AUDIO_TYPES.has(baseType)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${audioFile.type}. Accepted: ${[...ACCEPTED_AUDIO_TYPES].join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500MB." },
        { status: 400 }
      );
    }

    // Validate session exists and belongs to this therapist
    const therapySession = await getTherapySession({ id: sessionId });
    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (therapySession.therapistId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check consents
    const consented = await hasRequiredConsents({
      sessionId,
      recordingType: therapySession.recordingType,
    });
    if (!consented) {
      return NextResponse.json(
        { error: "Required consents not recorded" },
        { status: 403 }
      );
    }

    // Normalise to IANA-standard type for storage and downstream use
    const normalisedType = normaliseMimeType(baseType);

    // Upload to Supabase Storage
    const extension = getExtension(normalisedType);
    const storagePath = `${session.user.id}/${sessionId}/audio.${extension}`;
    const fileBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Audio is encrypted at the application layer before storage
    const encryptedAudio = await encryptBuffer(fileBuffer, sessionId);

    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from("session-audio")
      .upload(storagePath, encryptedAudio, {
        contentType: normalisedType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Audio upload error:", uploadError);
      const isUnsupportedType =
        "status" in uploadError && uploadError.status === 415;
      return NextResponse.json(
        {
          error: isUnsupportedType
            ? `File format not accepted by storage: ${baseType}. Please convert to MP3, WAV, or MP4.`
            : "Failed to upload audio",
        },
        { status: isUnsupportedType ? 415 : 500 }
      );
    }

    // Update session record
    await updateTherapySession({
      id: sessionId,
      audioStoragePath: storagePath,
      audioMimeType: normalisedType,
      transcriptionStatus: "uploading",
    });

    return NextResponse.json({ success: true, storagePath });
  } catch (error) {
    console.error("Upload route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
