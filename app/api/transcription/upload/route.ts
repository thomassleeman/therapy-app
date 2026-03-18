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
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/x-m4a",
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/x-m4a": "m4a",
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
    const consented = await hasRequiredConsents({ sessionId });
    if (!consented) {
      return NextResponse.json(
        { error: "Required consents not recorded" },
        { status: 403 }
      );
    }

    // Upload to Supabase Storage
    const extension = getExtension(baseType);
    const storagePath = `${session.user.id}/${sessionId}/audio.${extension}`;
    const fileBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Audio is encrypted at the application layer before storage
    const encryptedAudio = await encryptBuffer(fileBuffer, sessionId);

    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from("session-audio")
      .upload(storagePath, encryptedAudio, {
        contentType: baseType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Audio upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload audio" },
        { status: 500 }
      );
    }

    // Update session record
    await updateTherapySession({
      id: sessionId,
      audioStoragePath: storagePath,
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
