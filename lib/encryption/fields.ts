import { decrypt, encrypt, isEncrypted } from "./crypto";

// ---------------------------------------------------------------------------
// Nullable field helpers
// ---------------------------------------------------------------------------

/**
 * Encrypt a nullable string field. Returns `null` for null, undefined, or
 * empty string input — otherwise returns the encrypted envelope.
 */
export async function encryptField(
  value: string | null | undefined,
  recordId: string,
): Promise<string | null> {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return encrypt(value, recordId);
}

/**
 * Decrypt a nullable string field. Returns `null` for null, undefined, or
 * empty string input. Passes through plaintext values unchanged during the
 * migration period.
 */
export async function decryptField(
  value: string | null | undefined,
  recordId: string,
): Promise<string | null> {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (!isEncrypted(value)) {
    return value;
  }
  return decrypt(value, recordId);
}

// ---------------------------------------------------------------------------
// JSONB helpers
// ---------------------------------------------------------------------------

/**
 * Encrypt an arbitrary value as JSONB. The value is serialised to JSON,
 * encrypted, and wrapped in `{ _encrypted: ciphertext }` so it remains
 * valid JSONB in Postgres.
 */
export async function encryptJsonb<T>(
  value: T,
  recordId: string,
): Promise<{ _encrypted: string }> {
  const json = JSON.stringify(value);
  const ciphertext = await encrypt(json, recordId);
  return { _encrypted: ciphertext };
}

/**
 * Decrypt a JSONB value. If the value is an object with an `_encrypted` key,
 * the ciphertext is decrypted and parsed. Otherwise the value is returned
 * as-is (plaintext passthrough for the migration period).
 */
export async function decryptJsonb<T>(
  value: unknown,
  recordId: string,
): Promise<T> {
  if (
    typeof value === "object" &&
    value !== null &&
    "_encrypted" in value &&
    typeof (value as { _encrypted: unknown })._encrypted === "string"
  ) {
    const json = await decrypt(
      (value as { _encrypted: string })._encrypted,
      recordId,
    );
    return JSON.parse(json) as T;
  }
  return value as T;
}

// ---------------------------------------------------------------------------
// Segment helpers
// ---------------------------------------------------------------------------

/**
 * Encrypt the `content` field of each segment in an array. Each segment's
 * content is encrypted with a unique derivation context based on the session
 * ID and array index. All other fields are passed through unchanged.
 */
export async function encryptSegments<T extends { content: string }>(
  segments: T[],
  sessionId: string,
): Promise<T[]> {
  return Promise.all(
    segments.map(async (segment, index) => ({
      ...segment,
      content: await encrypt(
        segment.content,
        `${sessionId}:segment:${index}`,
      ),
    })),
  );
}

/**
 * Decrypt the `content` field of each segment in an array. Segments with
 * plaintext content are passed through unchanged (migration period support).
 */
export async function decryptSegments<T extends { content: string }>(
  segments: T[],
  sessionId: string,
): Promise<T[]> {
  return Promise.all(
    segments.map(async (segment, index) => {
      if (!isEncrypted(segment.content)) {
        return segment;
      }
      return {
        ...segment,
        content: await decrypt(
          segment.content,
          `${sessionId}:segment:${index}`,
        ),
      };
    }),
  );
}
