import { AssemblyAIProvider } from "./providers/assemblyai";
import { ClaudeDiarizationProvider } from "./providers/claude-diarization";
import type {
  DiarisedTranscript,
  DiarizationProvider,
  DiarizeOptions,
  TranscribeOptions,
  TranscriptionProvider,
} from "./types";

/**
 * Returns the active transcription provider.
 *
 * Only GDPR-compliant providers with EU data residency are permitted.
 * OpenAI Whisper was removed — it has no EU data residency option for audio
 * processing, making it non-compliant for Article 9 special category data.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  return new AssemblyAIProvider();
}

/**
 * Returns the active diarization provider based on env config.
 * Default: AssemblyAI (audio-based speaker diarisation).
 */
export function getDiarizationProvider(): DiarizationProvider {
  const provider = process.env.DIARIZATION_PROVIDER ?? "assemblyai";
  switch (provider) {
    case "assemblyai":
      return new AssemblyAIProvider();
    case "claude":
      return new ClaudeDiarizationProvider();
    default:
      console.warn(
        `[transcription] Unknown diarization provider "${provider}", falling back to assemblyai`
      );
      return new AssemblyAIProvider();
  }
}

/**
 * High-level orchestrator: takes raw audio, returns a fully diarised transcript.
 * This is the main entry point used by API routes.
 *
 * When both providers are AssemblyAI (the default), uses a single combined API
 * call for transcription + diarisation — halving cost and latency.
 * Otherwise falls back to the two-step approach.
 */
export async function transcribeAndDiarize(
  audioBuffer: Buffer,
  options?: {
    transcribe?: TranscribeOptions;
    diarize?: DiarizeOptions;
    skipDiarization?: boolean;
  }
): Promise<DiarisedTranscript> {
  const diarizationProvider = process.env.DIARIZATION_PROVIDER ?? "assemblyai";

  // Fast path: if diarization is also AssemblyAI, use the combined single-call method
  if (diarizationProvider === "assemblyai" && !options?.skipDiarization) {
    const provider = new AssemblyAIProvider();
    console.log(
      "[transcription] Using AssemblyAI combined transcription + diarisation..."
    );
    const { diarised } = await provider.transcribeWithDiarization(audioBuffer, {
      language: options?.transcribe?.language,
      expectedSpeakers: options?.diarize?.expectedSpeakers,
      mimeType: options?.transcribe?.mimeType,
    });
    console.log(
      `[transcription] Complete: ${diarised.segments.length} segments, speakers: ${diarised.speakers.join(", ")}`
    );
    return diarised;
  }

  // Two-step path (for Claude diarization)
  const transcriber = getTranscriptionProvider();

  console.log("[transcription] Starting transcription...");
  const rawTranscript = await transcriber.transcribe(
    audioBuffer,
    options?.transcribe ?? {}
  );
  console.log(
    `[transcription] Raw transcript: ${rawTranscript.segments.length} segments, ${Math.round(rawTranscript.durationMs / 1000)}s`
  );

  if (options?.skipDiarization) {
    console.log(
      "[transcription] Skipping diarization (single-speaker summary recording)"
    );
    return {
      segments: rawTranscript.segments.map((seg) => ({
        speaker: "therapist",
        content: seg.text,
        startTimeMs: seg.startTimeMs,
        endTimeMs: seg.endTimeMs,
        confidence: seg.confidence,
      })),
      speakers: ["therapist"],
      durationMs: rawTranscript.durationMs,
    };
  }

  const diarizer = getDiarizationProvider();

  console.log("[transcription] Starting speaker labelling...");
  const diarisedTranscript = await diarizer.diarize(
    rawTranscript,
    options?.diarize ?? {},
    audioBuffer
  );
  console.log(
    `[transcription] Diarised: ${diarisedTranscript.segments.length} segments, speakers: ${diarisedTranscript.speakers.join(", ")}`
  );

  return diarisedTranscript;
}

export { AssemblyAIProvider } from "./providers/assemblyai";

export type {
  DiarisedSegment,
  DiarisedTranscript,
  DiarizationProvider,
  DiarizeOptions,
  RawTranscript,
  RawTranscriptSegment,
  TranscribeOptions,
  TranscriptionProvider,
} from "./types";
