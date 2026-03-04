import type {
  RawTranscript,
  RawTranscriptSegment,
  TranscribeOptions,
  TranscriptionProvider,
} from "@/lib/transcription/types";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB Whisper API limit
const TARGET_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB target (headroom)
const OVERLAP_SECONDS = 3;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

const DOMAIN_PROMPT =
  "This is a therapy session between a therapist and their client. Common terms: CBT, cognitive behavioural therapy, presenting issues, formulation, therapeutic alliance, safeguarding, psychodynamic, person-centred.";

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  avg_logprob: number;
  no_speech_prob: number;
}

interface WhisperResponse {
  text: string;
  language: string;
  duration: number;
  segments: WhisperSegment[];
}

function wordOverlap(a: string, b: string): number {
  const wordsA = a.trim().toLowerCase().split(/\s+/);
  const wordsB = b.trim().toLowerCase().split(/\s+/);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  let matches = 0;
  for (const word of wordsA) {
    if (wordsB.includes(word)) matches++;
  }
  return matches / Math.max(wordsA.length, wordsB.length);
}

function mapSegment(
  seg: WhisperSegment,
  offsetMs: number
): RawTranscriptSegment {
  return {
    text: seg.text,
    startTimeMs: Math.round(seg.start * 1000) + offsetMs,
    endTimeMs: Math.round(seg.end * 1000) + offsetMs,
    confidence: Math.exp(seg.avg_logprob),
  };
}

async function callWhisperApi(
  audioBuffer: Buffer,
  language: string,
  prompt: string
): Promise<WhisperResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-1");
  formData.append("language", language);
  formData.append("response_format", "verbose_json");
  formData.append("prompt", prompt);
  formData.append("timestamp_granularities[]", "segment");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      }
    );

    if (response.ok) {
      return (await response.json()) as WhisperResponse;
    }

    if (response.status === 429) {
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      console.warn(`[whisper] Rate limited, retrying in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      lastError = new Error("Whisper API rate limited (429)");
      continue;
    }

    if (response.status === 413) {
      throw new PayloadTooLargeError();
    }

    const body = await response.text();
    throw new Error(
      `Whisper API error ${response.status}: ${body.slice(0, 500)}`
    );
  }

  throw lastError ?? new Error("Whisper API request failed after retries");
}

class PayloadTooLargeError extends Error {
  constructor() {
    super("Whisper API returned 413: payload too large");
    this.name = "PayloadTooLargeError";
  }
}

interface ChunkDef {
  buffer: Buffer;
  offsetMs: number;
}

function splitIntoChunks(
  audio: Buffer,
  estimatedDurationSeconds: number,
  targetSize: number
): ChunkDef[] {
  const bytesPerSecond = audio.length / estimatedDurationSeconds;
  const chunkDurationSeconds = targetSize / bytesPerSecond;
  const overlapBytes = Math.round(OVERLAP_SECONDS * bytesPerSecond);
  const chunks: ChunkDef[] = [];

  let byteOffset = 0;
  let timeOffsetMs = 0;

  while (byteOffset < audio.length) {
    const end = Math.min(byteOffset + targetSize, audio.length);
    chunks.push({
      buffer: Buffer.from(audio.subarray(byteOffset, end)),
      offsetMs: timeOffsetMs,
    });

    const chunkBytes = end - byteOffset;
    const chunkSeconds = chunkBytes / bytesPerSecond;
    timeOffsetMs += Math.round(chunkSeconds * 1000);

    if (end >= audio.length) break;

    // Next chunk starts with overlap
    byteOffset = end - overlapBytes;
    timeOffsetMs -= Math.round(OVERLAP_SECONDS * 1000);
  }

  return chunks;
}

function deduplicateOverlap(
  allSegments: RawTranscriptSegment[],
  chunkBoundaries: number[]
): RawTranscriptSegment[] {
  if (chunkBoundaries.length === 0) return allSegments;

  const result: RawTranscriptSegment[] = [];
  let segIdx = 0;

  for (
    let boundaryIdx = 0;
    boundaryIdx < chunkBoundaries.length;
    boundaryIdx++
  ) {
    const boundarySegStart = chunkBoundaries[boundaryIdx];

    // Add segments up to the boundary
    while (segIdx < boundarySegStart) {
      result.push(allSegments[segIdx]);
      segIdx++;
    }

    // Check for overlap between last segment before boundary and first after
    if (segIdx > 0 && segIdx < allSegments.length) {
      const prev = allSegments[segIdx - 1];
      const next = allSegments[segIdx];
      if (wordOverlap(prev.text, next.text) > 0.8) {
        // Skip the duplicate (keep the earlier one)
        segIdx++;
      }
    }
  }

  // Add remaining segments
  while (segIdx < allSegments.length) {
    result.push(allSegments[segIdx]);
    segIdx++;
  }

  return result;
}

export class WhisperApiProvider implements TranscriptionProvider {
  async transcribe(
    audio: Buffer,
    options: TranscribeOptions = {}
  ): Promise<RawTranscript> {
    const startTime = performance.now();
    const language = options.language ?? "en";
    const prompt = options.prompt
      ? `${DOMAIN_PROMPT} ${options.prompt}`
      : DOMAIN_PROMPT;

    let allSegments: RawTranscriptSegment[] = [];
    let totalDurationMs = 0;
    let detectedLanguage = language;
    const chunkCount = 1;
    const chunkBoundaries: number[] = [];

    if (audio.length <= MAX_FILE_SIZE) {
      // Single request
      try {
        const response = await callWhisperApi(audio, language, prompt);
        allSegments = response.segments.map((seg) => mapSegment(seg, 0));
        totalDurationMs = Math.round(response.duration * 1000);
        detectedLanguage = response.language;
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          // Fall through to chunked path with a rough duration estimate
          // Assume ~128kbps bitrate for webm as a fallback
          const estimatedDuration = audio.length / (128 * 128);
          return this.transcribeChunked(
            audio,
            estimatedDuration,
            language,
            prompt,
            startTime
          );
        }
        throw error;
      }
    } else {
      // Estimate duration from file size assuming ~128kbps bitrate for webm
      const estimatedDuration = audio.length / (128 * 128);
      return this.transcribeChunked(
        audio,
        estimatedDuration,
        language,
        prompt,
        startTime
      );
    }

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`[whisper] Transcribed ${chunkCount} chunk(s) in ${elapsed}ms`);

    return {
      segments: allSegments,
      fullText: allSegments.map((s) => s.text).join(""),
      durationMs: totalDurationMs,
      language: detectedLanguage,
    };
  }

  private async transcribeChunked(
    audio: Buffer,
    estimatedDurationSeconds: number,
    language: string,
    prompt: string,
    startTime: number
  ): Promise<RawTranscript> {
    let targetSize = TARGET_CHUNK_SIZE;
    let chunks = splitIntoChunks(audio, estimatedDurationSeconds, targetSize);
    let allSegments: RawTranscriptSegment[] = [];
    const chunkBoundaries: number[] = [];
    let totalDurationMs = 0;
    let detectedLanguage = language;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const response = await callWhisperApi(chunk.buffer, language, prompt);

        const segmentsBefore = allSegments.length;
        const mapped = response.segments.map((seg) =>
          mapSegment(seg, chunk.offsetMs)
        );
        allSegments.push(...mapped);

        if (i > 0) {
          chunkBoundaries.push(segmentsBefore);
        }

        if (i === 0) {
          detectedLanguage = response.language;
        }

        // Use the last chunk's duration + offset for total
        const chunkEndMs =
          chunk.offsetMs + Math.round(response.duration * 1000);
        if (chunkEndMs > totalDurationMs) {
          totalDurationMs = chunkEndMs;
        }
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          // Reduce chunk size and retry from the beginning
          targetSize = Math.round(targetSize * 0.6);
          if (targetSize < 1024 * 1024) {
            throw new Error(
              "Audio chunks still too large after reducing chunk size"
            );
          }
          chunks = splitIntoChunks(audio, estimatedDurationSeconds, targetSize);
          allSegments = [];
          chunkBoundaries.length = 0;
          i = -1; // Will increment to 0
          continue;
        }
        throw error;
      }
    }

    const deduplicated = deduplicateOverlap(allSegments, chunkBoundaries);

    const elapsed = Math.round(performance.now() - startTime);
    console.log(
      `[whisper] Transcribed ${chunks.length} chunk(s) in ${elapsed}ms`
    );

    return {
      segments: deduplicated,
      fullText: deduplicated.map((s) => s.text).join(""),
      durationMs: totalDurationMs,
      language: detectedLanguage,
    };
  }
}
