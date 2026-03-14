import {
  createCipheriv,
  createDecipheriv,
  hkdf,
  randomBytes,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit, standard for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit
const KEY_LENGTH = 32; // 256-bit
const HKDF_HASH = "sha256";
const VERSION_PREFIX = "v1"; // 2 ASCII bytes — future-proofing the envelope format

// Envelope layout (byte offsets):
//  [0..1]   version  — 2 bytes, ASCII "v1"
//  [2..13]  IV       — 12 bytes
//  [14..29] auth tag — 16 bytes
//  [30..]   ciphertext — variable length
const VERSION_LENGTH = 2;
const HEADER_LENGTH = VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH; // 30 bytes
const MIN_ENVELOPE_LENGTH = HEADER_LENGTH + 1; // at least 1 byte of ciphertext

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getMasterKey(): Buffer {
  const hex = process.env.ENCRYPTION_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

function deriveKey(context: string): Promise<Buffer> {
  const masterKey = getMasterKey();
  return new Promise((resolve, reject) => {
    hkdf(
      HKDF_HASH,
      masterKey,
      "", // salt — empty string
      context, // info — the record's unique ID
      KEY_LENGTH,
      (err, derivedKey) => {
        if (err) {
          return reject(err);
        }
        resolve(Buffer.from(derivedKey));
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string using AES-256-GCM with a per-record derived key.
 *
 * Returns a base64-encoded envelope containing the version prefix, IV,
 * authentication tag, and ciphertext.
 *
 * @param plaintext - The UTF-8 string to encrypt
 * @param recordId - Unique ID (UUID) of the record, used to derive a per-record key via HKDF
 */
export async function encrypt(
  plaintext: string,
  recordId: string
): Promise<string> {
  const key = await deriveKey(recordId);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Envelope: version (2B) + IV (12B) + auth tag (16B) + ciphertext (variable)
  const versionBytes = Buffer.from(VERSION_PREFIX, "ascii");
  const envelope = Buffer.concat([versionBytes, iv, authTag, encrypted]);

  return envelope.toString("base64");
}

/**
 * Decrypt a base64-encoded envelope back to the original plaintext string.
 *
 * Verifies the version prefix, unpacks the IV and auth tag, derives the
 * per-record key, and decrypts. Auth tag verification failures propagate
 * directly from Node.js crypto.
 *
 * @param encryptedValue - Base64-encoded envelope produced by `encrypt()`
 * @param recordId - The same record ID used during encryption
 */
export async function decrypt(
  encryptedValue: string,
  recordId: string
): Promise<string> {
  const envelope = Buffer.from(encryptedValue, "base64");

  // Verify version prefix
  const version = envelope.subarray(0, VERSION_LENGTH).toString("ascii");
  if (version !== VERSION_PREFIX) {
    throw new Error(
      `Unsupported encryption envelope version: "${version}". Expected "${VERSION_PREFIX}".`
    );
  }

  // Unpack envelope components
  const iv = envelope.subarray(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH);
  const authTag = envelope.subarray(
    VERSION_LENGTH + IV_LENGTH,
    VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = envelope.subarray(HEADER_LENGTH);

  const key = await deriveKey(recordId);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt a binary Buffer using AES-256-GCM with a per-record derived key.
 *
 * Returns a raw Buffer envelope (no base64 encoding) for direct storage
 * in Supabase Storage. Used for audio files and other binary data.
 *
 * @param data - The raw binary Buffer to encrypt
 * @param recordId - Unique ID (UUID) of the record, used to derive a per-record key via HKDF
 */
export async function encryptBuffer(
  data: Buffer,
  recordId: string
): Promise<Buffer> {
  const key = await deriveKey(recordId);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Envelope: version (2B) + IV (12B) + auth tag (16B) + ciphertext (variable)
  const versionBytes = Buffer.from(VERSION_PREFIX, "ascii");
  return Buffer.concat([versionBytes, iv, authTag, encrypted]);
}

/**
 * Decrypt a raw Buffer envelope back to the original binary data.
 *
 * Inverse of `encryptBuffer()`. Verifies the version prefix, unpacks
 * components, and decrypts. Auth tag verification failures propagate
 * directly from Node.js crypto.
 *
 * @param data - Raw Buffer envelope produced by `encryptBuffer()`
 * @param recordId - The same record ID used during encryption
 */
export async function decryptBuffer(
  data: Buffer,
  recordId: string
): Promise<Buffer> {
  // Verify version prefix
  const version = data.subarray(0, VERSION_LENGTH).toString("ascii");
  if (version !== VERSION_PREFIX) {
    throw new Error(
      `Unsupported encryption envelope version: "${version}". Expected "${VERSION_PREFIX}".`
    );
  }

  // Unpack envelope components
  const iv = data.subarray(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH);
  const authTag = data.subarray(
    VERSION_LENGTH + IV_LENGTH,
    VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = data.subarray(HEADER_LENGTH);

  const key = await deriveKey(recordId);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Synchronously check whether a string looks like an encrypted envelope.
 *
 * Used during the migration period to distinguish encrypted values from
 * plaintext. Returns `false` for any error or failed check — never throws.
 *
 * @param value - The string to check (expected to be base64 if encrypted)
 */
export function isEncrypted(value: string): boolean {
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length < MIN_ENVELOPE_LENGTH) {
      return false;
    }
    return buf.subarray(0, VERSION_LENGTH).toString("ascii") === VERSION_PREFIX;
  } catch {
    return false;
  }
}
