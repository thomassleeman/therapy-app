/**
 * Raw transcript output from a speech-to-text provider.
 * No speaker labels — just timestamped text.
 */
export interface RawTranscriptSegment {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number;
}

export interface RawTranscript {
  segments: RawTranscriptSegment[];
  fullText: string;
  durationMs: number;
  language: string;
}

/**
 * Diarised transcript with speaker labels applied.
 */
export interface DiarisedSegment {
  speaker: string; // 'therapist', 'client', 'client_2', 'unknown'
  content: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number;
}

export interface DiarisedTranscript {
  segments: DiarisedSegment[];
  speakers: string[]; // unique speaker labels found
  durationMs: number;
}

/**
 * Interface for speech-to-text providers.
 * Current: OpenAI Whisper API
 * Future: self-hosted WhisperX
 */
export interface TranscriptionProvider {
  /**
   * Transcribe an audio buffer into raw text with timestamps.
   * The provider handles chunking internally if needed.
   */
  transcribe(audio: Buffer, options: TranscribeOptions): Promise<RawTranscript>;
}

export interface TranscribeOptions {
  language?: string; // ISO 639-1, default 'en'
  prompt?: string; // Whisper context prompt for domain vocabulary
}

/**
 * Interface for speaker diarization providers.
 * Current: Claude text-based inference
 * Future: pyannote audio-based diarization
 */
export interface DiarizationProvider {
  /**
   * Apply speaker labels to a raw transcript.
   *
   * Note: the `audioBuffer` parameter is optional because the current
   * Claude-based implementation doesn't need it (works from text only).
   * The pyannote implementation WILL need it (works from audio).
   * Including it in the interface now avoids a breaking change later.
   */
  diarize(
    transcript: RawTranscript,
    options: DiarizeOptions,
    audioBuffer?: Buffer
  ): Promise<DiarisedTranscript>;
}

export interface DiarizeOptions {
  expectedSpeakers?: number; // default 2 (therapist + client)
  sessionContext?: string; // e.g. "couples therapy" — helps Claude
}
