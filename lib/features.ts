/**
 * Feature flags for the therapy app.
 *
 * These control feature availability at compile time. To reinstate a disabled
 * feature, change the flag to `true` and reverse the conditional changes at
 * each integration point (search the codebase for the flag name).
 *
 * ARTIFACTS_ENABLED: Controls the Vercel AI template's document/artifact system.
 * When false, the AI agent cannot create or edit documents in chat, the artifact
 * panel is hidden, and the dashboard does not show "Recent Documents".
 * Integration points: chat route tools, system prompt, chat page UI, dashboard.
 */
export const ARTIFACTS_ENABLED = false as const;
