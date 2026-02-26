import type { TherapeuticOrientation } from "./prompts";

/**
 * Maps a TherapeuticOrientation value to the corresponding search tool
 * modality filter. Returns null for orientations that don't have dedicated
 * knowledge base content (systemic, existential, integrative) — the tools
 * will search across all modalities.
 */
const ORIENTATION_TO_MODALITY: Record<TherapeuticOrientation, string | null> = {
  cbt: "cbt",
  "person-centred": "person_centred",
  psychodynamic: "psychodynamic",
  integrative: null,
  systemic: null,
  existential: null,
};

export function orientationToModality(
  orientation: TherapeuticOrientation | undefined
): string | null {
  if (!orientation) {
    return null;
  }
  return ORIENTATION_TO_MODALITY[orientation] ?? null;
}

/**
 * Resolves the effective modality for search tool filtering.
 *
 * Priority chain:
 * 1. Per-chat override (therapeuticOrientation from request body)
 * 2. Per-client default (therapeutic_modalities[0] from client record)
 * 3. Therapist default (default_modality from therapist_profiles)
 * 4. null (no filter — search across all modalities)
 */
export function resolveModality({
  chatOrientation,
  clientModalities,
  therapistDefault,
}: {
  chatOrientation?: TherapeuticOrientation;
  clientModalities?: string[];
  therapistDefault?: string | null;
}): string | null {
  // 1. Per-chat override
  if (chatOrientation) {
    const mapped = orientationToModality(chatOrientation);
    if (mapped) {
      return mapped;
    }
  }

  // 2. Per-client (already in tool-compatible format)
  if (clientModalities && clientModalities.length > 0) {
    return clientModalities[0];
  }

  // 3. Therapist default
  if (therapistDefault) {
    return therapistDefault;
  }

  // 4. No filter
  return null;
}
