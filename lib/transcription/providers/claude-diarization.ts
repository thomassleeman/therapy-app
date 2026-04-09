import { generateObject } from "ai";
import { getSmallModel } from "@/lib/ai/providers";
import { z } from "zod";
import type {
  DiarisedSegment,
  DiarisedTranscript,
  DiarizationProvider,
  DiarizeOptions,
  RawTranscript,
} from "@/lib/transcription/types";

const HAIKU_INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
const HAIKU_OUTPUT_COST_PER_TOKEN = 4 / 1_000_000;

const speakerLabelSchema = z.object({
  labels: z.array(
    z.object({
      segmentIndex: z.number(),
      speaker: z.enum(["therapist", "client", "client_2", "unknown"]),
    })
  ),
});

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildPrompt(
  transcript: RawTranscript,
  options: DiarizeOptions
): string {
  const expectedSpeakers = options.expectedSpeakers ?? 2;

  const speakerLabels =
    expectedSpeakers >= 3
      ? "'therapist', 'client', or 'client_2'"
      : "'therapist' or 'client'";

  const contextLine = options.sessionContext
    ? `\nSession context: ${options.sessionContext}\n`
    : "";

  const segmentLines = transcript.segments
    .map(
      (seg, i) =>
        `[${i}] (${formatTimestamp(seg.startTimeMs)}-${formatTimestamp(seg.endTimeMs)}) ${seg.text}`
    )
    .join("\n");

  return `You are analysing a therapy session transcript to identify who is speaking in each segment.

This session has ${expectedSpeakers} speakers.${contextLine}

Label each segment with one of: ${speakerLabels}. If you cannot determine the speaker, use 'unknown'.

The therapist typically speaks first, asks questions, reflects back what the client says, and uses therapeutic techniques. The client shares their experiences, feelings, and responses.

Transcript:
${segmentLines}

Return an array of objects with segmentIndex and speaker for every segment listed above.`;
}

function mergeConsecutiveSegments(
  segments: DiarisedSegment[]
): DiarisedSegment[] {
  if (segments.length === 0) {
    return [];
  }

  const merged: DiarisedSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.speaker === current.speaker) {
      // Merge: concatenate content, extend time range, average confidence
      const currentWeight = current.endTimeMs - current.startTimeMs || 1;
      const segWeight = seg.endTimeMs - seg.startTimeMs || 1;
      current.content = `${current.content} ${seg.content}`;
      current.endTimeMs = seg.endTimeMs;
      current.confidence =
        (current.confidence * currentWeight + seg.confidence * segWeight) /
        (currentWeight + segWeight);
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }

  merged.push(current);
  return merged;
}

export class ClaudeDiarizationProvider implements DiarizationProvider {
  async diarize(
    transcript: RawTranscript,
    options: DiarizeOptions = {},
    // audioBuffer unused in Claude-based diarization. Will be used by pyannote provider.
    _audioBuffer?: Buffer
  ): Promise<DiarisedTranscript> {
    if (transcript.segments.length === 0) {
      return { segments: [], speakers: [], durationMs: transcript.durationMs };
    }

    const prompt = buildPrompt(transcript, options);

    const { object, usage } = await generateObject({
      model: getSmallModel(),
      schema: speakerLabelSchema,
      prompt,
    });

    const labelMap = new Map<number, string>();
    for (const label of object.labels) {
      labelMap.set(label.segmentIndex, label.speaker);
    }

    // Warn if Claude didn't cover all segments
    const missingIndices: number[] = [];
    for (let i = 0; i < transcript.segments.length; i++) {
      if (!labelMap.has(i)) {
        missingIndices.push(i);
      }
    }
    if (missingIndices.length > 0) {
      console.warn(
        `[diarization] Claude did not label ${missingIndices.length} segment(s): [${missingIndices.join(", ")}]. Marking as 'unknown'.`
      );
    }

    // Map labels onto raw segments
    const labelledSegments: DiarisedSegment[] = transcript.segments.map(
      (seg, i) => ({
        speaker: labelMap.get(i) ?? "unknown",
        content: seg.text,
        startTimeMs: seg.startTimeMs,
        endTimeMs: seg.endTimeMs,
        confidence: seg.confidence,
      })
    );

    const merged = mergeConsecutiveSegments(labelledSegments);
    const speakers = [...new Set(merged.map((s) => s.speaker))];

    // Cost logging
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const cost =
      inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
      outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;
    console.log(
      `[diarization] Labelled ${transcript.segments.length} segments using ${inputTokens + outputTokens} tokens (~$${cost.toFixed(4)})`
    );

    return {
      segments: merged,
      speakers,
      durationMs: transcript.durationMs,
    };
  }
}
