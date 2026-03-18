/**
 * AssemblyAI transcription and speaker diarisation provider.
 *
 * WHY AssemblyAI:
 * - EU data residency — the EU base URL routes all audio processing to Dublin
 *   (eu-west-1), satisfying GDPR requirements for special category health data.
 *   EU residency is controlled entirely by the base URL; no dashboard setting needed.
 * - Built-in audio-based speaker diarisation — replaces the previous two-step
 *   Whisper + Claude text-inference approach with a single, more accurate pipeline.
 * - Lower cost per minute than Whisper + Claude diarisation combined.
 *
 * Preferred entry point: `transcribeWithDiarization()` — performs transcription
 * and diarisation in a single API call, halving cost and latency.
 */

import type { Transcript } from "assemblyai";
import { AssemblyAI } from "assemblyai";
import type {
  DiarisedSegment,
  DiarisedTranscript,
  DiarizationProvider,
  DiarizeOptions,
  RawTranscript,
  RawTranscriptSegment,
  TranscribeOptions,
  TranscriptionProvider,
} from "@/lib/transcription/types";

const EU_BASE_URL = "https://api.eu.assemblyai.com";

let _client: AssemblyAI | null = null;

function getApiKey(): string {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[AssemblyAI] ASSEMBLYAI_API_KEY is not set. Required for session transcription."
    );
  }
  return apiKey;
}

function getClient(): AssemblyAI {
  if (!_client) {
    _client = new AssemblyAI({
      apiKey: getApiKey(),
      baseUrl: EU_BASE_URL,
    });
  }
  return _client;
}

/**
 * Upload audio to AssemblyAI with the correct Content-Type header.
 *
 * The AssemblyAI SDK hardcodes `Content-Type: application/octet-stream` when
 * uploading, which causes their transcoder to misidentify Chrome's WebM audio
 * files as `video/webm` and reject them. This helper bypasses the SDK's upload
 * and sets `Content-Type: audio/webm` so the transcoder recognises the audio.
 */
async function uploadAudio(audio: Buffer): Promise<string> {
  const response = await fetch(`${EU_BASE_URL}/v2/upload`, {
    method: "POST",
    headers: {
      Authorization: getApiKey(),
      "Content-Type": "audio/webm",
    },
    body: new Uint8Array(audio),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[AssemblyAI] Upload failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { upload_url: string };
  return data.upload_url;
}

/**
 * Group word-level results into sentence-level segments by splitting
 * on sentence-ending punctuation (`.`, `?`, `!`).
 */
function groupWordsIntoSegments(
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>
): RawTranscriptSegment[] {
  const segments: RawTranscriptSegment[] = [];
  let currentWords: typeof words = [];

  for (const word of words) {
    currentWords.push(word);

    const trimmed = word.text.trimEnd();
    if (
      trimmed.endsWith(".") ||
      trimmed.endsWith("?") ||
      trimmed.endsWith("!")
    ) {
      segments.push(flushSegment(currentWords));
      currentWords = [];
    }
  }

  // Flush any remaining words that didn't end with sentence punctuation
  if (currentWords.length > 0) {
    segments.push(flushSegment(currentWords));
  }

  return segments;
}

function flushSegment(
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>
): RawTranscriptSegment {
  const text = words.map((w) => w.text).join(" ");
  const totalConfidence = words.reduce((sum, w) => sum + w.confidence, 0);

  return {
    text,
    startTimeMs: words[0].start,
    endTimeMs: words[words.length - 1].end,
    confidence: totalConfidence / words.length,
  };
}

function buildRawTranscript(
  transcript: Transcript,
  fallbackLanguage: string
): RawTranscript {
  const segments = transcript.words
    ? groupWordsIntoSegments(transcript.words)
    : [];
  const durationMs = (transcript.audio_duration ?? 0) * 1000;

  return {
    segments,
    fullText: transcript.text ?? "",
    durationMs,
    language: transcript.language_code ?? fallbackLanguage,
  };
}

function buildDiarisedTranscript(transcript: Transcript): DiarisedTranscript {
  const utterances = transcript.utterances ?? [];

  const segments: DiarisedSegment[] = utterances.map((u) => ({
    speaker: u.speaker.toLowerCase(),
    content: u.text,
    startTimeMs: u.start,
    endTimeMs: u.end,
    confidence: u.confidence,
  }));

  const speakers = [...new Set(segments.map((s) => s.speaker))];
  const durationMs = (transcript.audio_duration ?? 0) * 1000;

  return { segments, speakers, durationMs };
}

export class AssemblyAIProvider
  implements TranscriptionProvider, DiarizationProvider
{
  async transcribe(
    audio: Buffer,
    options: TranscribeOptions = {}
  ): Promise<RawTranscript> {
    const client = getClient();
    const audioUrl = await uploadAudio(audio);

    const transcript = await client.transcripts.transcribe({
      audio_url: audioUrl,
      language_code: options.language ?? "en",
      speech_models: ["universal-3-pro", "universal-2"],
    });

    if (transcript.status === "error") {
      throw new Error(`[AssemblyAI] Failed to transcribe: ${transcript.error}`);
    }

    const result = buildRawTranscript(transcript, options.language ?? "en");

    console.log(
      `[assemblyai] Transcribed ${result.durationMs / 1000}s of audio, ${result.segments.length} segments`
    );

    return result;
  }

  async diarize(
    transcript: RawTranscript,
    options: DiarizeOptions,
    audioBuffer?: Buffer
  ): Promise<DiarisedTranscript> {
    if (!audioBuffer) {
      throw new Error(
        "[AssemblyAI] Audio buffer is required for speaker diarisation. " +
          "AssemblyAI performs audio-based diarisation, not text inference."
      );
    }

    const client = getClient();

    const audioUrl = await uploadAudio(audioBuffer);

    const result = await client.transcripts.transcribe({
      audio_url: audioUrl,
      speaker_labels: true,
      speakers_expected: options.expectedSpeakers,
      language_code: transcript.language,
      speech_models: ["universal-3-pro", "universal-2"],
    });

    if (result.status === "error") {
      throw new Error(`[AssemblyAI] Failed to diarize: ${result.error}`);
    }

    const diarised = buildDiarisedTranscript(result);

    console.log(
      `[assemblyai] Diarised: ${diarised.segments.length} utterances, ${diarised.speakers.length} speakers`
    );

    return diarised;
  }

  async transcribeWithDiarization(
    audio: Buffer,
    options?: {
      language?: string;
      expectedSpeakers?: number;
    }
  ): Promise<{ raw: RawTranscript; diarised: DiarisedTranscript }> {
    const client = getClient();
    const language = options?.language ?? "en";

    const audioUrl = await uploadAudio(audio);

    const transcript = await client.transcripts.transcribe({
      audio_url: audioUrl,
      language_code: language,
      speech_models: ["universal-3-pro", "universal-2"],
      speaker_labels: true,
      speakers_expected: options?.expectedSpeakers,
    });

    if (transcript.status === "error") {
      throw new Error(`[AssemblyAI] Failed to transcribe: ${transcript.error}`);
    }

    const raw = buildRawTranscript(transcript, language);
    const diarised = buildDiarisedTranscript(transcript);

    console.log(
      `[assemblyai] Transcribed ${raw.durationMs / 1000}s of audio, ${raw.segments.length} segments`
    );
    console.log(
      `[assemblyai] Diarised: ${diarised.segments.length} utterances, ${diarised.speakers.length} speakers`
    );

    return { raw, diarised };
  }
}
