# Error Reporting — Quick Guide

## What changed

When something goes wrong during recording, upload, or transcription, the app now captures structured diagnostic data and shows a **"Copy error report"** button alongside the error message.

## How to use it

1. If a recording or transcription fails, you'll see the usual error message plus a small **"Copy error report"** button underneath the "Try Again" button.
2. Tap **"Copy error report"**. The button changes to "Copied" and a confirmation toast appears.
3. Paste the copied text into a message to Tom. It contains everything needed to diagnose the issue — session ID, failure stage, error details, device info, and timestamps.

The report looks like this:

```
--- Pasu Health Error Report ---
Session: abc123-def456
Stage: transcribing
Error: [AssemblyAI] Failed to transcribe: audio_too_short
Code: STAGE_TIMEOUT
Time: 2026-04-02T14:30:00.000Z
Browser: Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 ...)
Audio format: audio/webm;codecs=opus
Provider: assemblyai
--- End Report ---
```

## Where the button appears

- **During recording/upload** — if microphone access is denied, recording fails mid-session, or the upload fails (network error, server error).
- **After upload, during transcription** — if transcription fails on the server, or if processing appears to have stalled (no progress for 30 seconds on quick stages, or 5 minutes during transcription).
- **On the session detail page** — if you navigate back to a session that previously failed transcription, the Transcript tab shows the error with the copy button.

## Stall detection

If the processing request silently fails (e.g. due to a network glitch after upload), the app detects that the status hasn't changed and automatically shows an error:

- **Uploading / Preparing / Saving** — flags a stall after 30 seconds
- **Transcribing / Labelling speakers** — flags a stall after 5 minutes (transcription legitimately takes time for longer sessions)

## Retrying

Tapping **"Try Again"** clears the error and any stored diagnostic data. If the retry also fails, a fresh error report is generated.

## Deployment note

The migration `supabase/migrations/20260402000000_add_processing_error.sql` adds a `processing_error` column to `therapy_sessions`. Run `pnpm db:push` locally or apply via the Supabase dashboard for hosted.
