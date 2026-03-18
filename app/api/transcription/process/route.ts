import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getTherapySession,
  hasRequiredConsents,
  insertSessionSegments,
  updateTherapySession,
} from "@/lib/db/queries";
import type { SessionSegmentInsert } from "@/lib/db/types";
import { decryptBuffer } from "@/lib/encryption/crypto";
import { encryptSegments } from "@/lib/encryption/fields";
import { transcribeAndDiarize } from "@/lib/transcription";

export const maxDuration = 300; // 5 minutes — Whisper can be slow for long files

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionId: string | undefined;

  try {
    const body = await request.json();
    const rawSessionId: string | undefined = body.sessionId;
    const expectedSpeakers: number | undefined = body.expectedSpeakers;

    if (!rawSessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    sessionId = rawSessionId;

    // Validate session exists, belongs to therapist, has audio
    const therapySession = await getTherapySession({ id: sessionId });
    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (therapySession.therapistId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!therapySession.audioStoragePath) {
      return NextResponse.json(
        { error: "No audio uploaded for this session" },
        { status: 400 }
      );
    }

    const isSummary = therapySession.recordingType === "therapist_summary";

    // Defence in depth: check consents again
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

    // Update status to preparing (downloading audio)
    await updateTherapySession({
      id: sessionId,
      transcriptionStatus: "preparing",
    });

    // Download audio from Supabase Storage using service role
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error: downloadError } = await serviceClient.storage
      .from("session-audio")
      .download(therapySession.audioStoragePath);

    if (downloadError || !data) {
      console.error("Audio download error:", downloadError);
      await updateTherapySession({
        id: sessionId,
        transcriptionStatus: "failed",
        errorMessage: "Failed to download audio from storage",
      });
      return NextResponse.json(
        { error: "Failed to download audio" },
        { status: 500 }
      );
    }

    // Decrypt audio from storage before sending to Whisper
    const audioBuffer = await decryptBuffer(
      Buffer.from(await data.arrayBuffer()),
      sessionId
    );

    // Update status to transcribing
    await updateTherapySession({
      id: sessionId,
      transcriptionStatus: "transcribing",
    });

    // Run transcription + diarization pipeline
    const diarisedTranscript = await transcribeAndDiarize(audioBuffer, {
      diarize: isSummary ? undefined : { expectedSpeakers },
      skipDiarization: isSummary,
    });

    // Update status to saving
    await updateTherapySession({
      id: sessionId,
      transcriptionStatus: "saving",
    });

    // Map segments to DB insert format
    const segmentInserts: SessionSegmentInsert[] =
      diarisedTranscript.segments.map((seg, index) => ({
        sessionId: sessionId as string,
        segmentIndex: index,
        speaker: seg.speaker,
        content: seg.content,
        startTimeMs: seg.startTimeMs,
        endTimeMs: seg.endTimeMs,
        confidence: seg.confidence,
      }));

    // Encrypt transcript content before storage
    const encryptedSegments = await encryptSegments(segmentInserts, sessionId);

    await insertSessionSegments(encryptedSegments);

    // Calculate duration and mark completed
    const durationMinutes = Math.ceil(diarisedTranscript.durationMs / 60_000);
    await updateTherapySession({
      id: sessionId,
      transcriptionStatus: "completed",
      durationMinutes,
    });

    // Clean up audio from storage — no longer needed after successful transcription.
    // Best-effort: log on failure but don't fail the request.
    try {
      await serviceClient.storage
        .from("session-audio")
        .remove([therapySession.audioStoragePath]);

      await updateTherapySession({
        id: sessionId,
        audioStoragePath: null,
      });

      console.log(
        `[transcription] Audio deleted from storage for session ${sessionId}`
      );
    } catch (cleanupError) {
      console.warn(
        `[transcription] Failed to delete audio for session ${sessionId}:`,
        cleanupError
      );
      // Audio remains in storage but transcription succeeded — not a critical failure.
      // A future cleanup job could sweep orphaned audio.
    }

    return NextResponse.json({
      success: true,
      segmentCount: diarisedTranscript.segments.length,
      durationMinutes,
      speakers: diarisedTranscript.speakers,
    });
  } catch (error) {
    console.error("Process route error:", error);

    // Mark session as failed if we have a sessionId
    if (sessionId) {
      try {
        await updateTherapySession({
          id: sessionId,
          transcriptionStatus: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      } catch (updateError) {
        console.error("Failed to update session status:", updateError);
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Transcription failed",
      },
      { status: 500 }
    );
  }
}
