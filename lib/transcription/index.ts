import { ClaudeDiarizationProvider } from "./providers/claude-diarization";

import { WhisperApiProvider } from "./providers/whisper-api";
import type {
  DiarisedTranscript,
  DiarizationProvider,
  DiarizeOptions,
  TranscribeOptions,
  TranscriptionProvider,
} from "./types";

/**
 * Returns the active transcription provider based on env config.
 * Current: WhisperApiProvider
 * Future: add WhisperXProvider and select via TRANSCRIPTION_PROVIDER env var
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  // Future: switch on process.env.TRANSCRIPTION_PROVIDER
  return new WhisperApiProvider();
}

/**
 * Returns the active diarization provider based on env config.
 * Current: ClaudeDiarizationProvider
 * Future: add PyannoteDiarizationProvider and select via DIARIZATION_PROVIDER env var
 */
export function getDiarizationProvider(): DiarizationProvider {
  // Future: switch on process.env.DIARIZATION_PROVIDER
  return new ClaudeDiarizationProvider();
}

/**
 * High-level orchestrator: takes raw audio, returns a fully diarised transcript.
 * This is the main entry point used by API routes.
 * The internals are swappable without changing the call site.
 */
export async function transcribeAndDiarize(
  audioBuffer: Buffer,
  options?: {
    transcribe?: TranscribeOptions;
    diarize?: DiarizeOptions;
  }
): Promise<DiarisedTranscript> {
  const transcriber = getTranscriptionProvider();
  const diarizer = getDiarizationProvider();

  console.log("[transcription] Starting transcription...");
  const rawTranscript = await transcriber.transcribe(
    audioBuffer,
    options?.transcribe ?? {}
  );
  console.log(
    `[transcription] Raw transcript: ${rawTranscript.segments.length} segments, ${Math.round(rawTranscript.durationMs / 1000)}s`
  );

  console.log("[transcription] Starting speaker labelling...");
  const diarisedTranscript = await diarizer.diarize(
    rawTranscript,
    options?.diarize ?? {},
    audioBuffer // passed through for future pyannote use
  );
  console.log(
    `[transcription] Diarised: ${diarisedTranscript.segments.length} segments, speakers: ${diarisedTranscript.speakers.join(", ")}`
  );

  return diarisedTranscript;
}

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
