import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  decrypt,
  decryptBuffer,
  encrypt,
  encryptBuffer,
  isEncrypted,
} from "../crypto";

const TEST_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
});

afterEach(() => {
  // Restore key if a test removed it
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
});

describe("encrypt / decrypt", () => {
  it("round-trips a simple string", async () => {
    const plaintext = "Hello, therapy world!";
    const recordId = "record-001";
    const encrypted = await encrypt(plaintext, recordId);
    const decrypted = await decrypt(encrypted, recordId);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", async () => {
    const plaintext = "same input";
    const recordId = "record-002";
    const a = await encrypt(plaintext, recordId);
    const b = await encrypt(plaintext, recordId);
    expect(a).not.toBe(b);
  });

  it("produces different ciphertexts for different recordIds (key isolation)", async () => {
    const plaintext = "same input";
    const a = await encrypt(plaintext, "record-A");
    const b = await encrypt(plaintext, "record-B");
    expect(a).not.toBe(b);
  });

  it("throws when decrypting with the wrong recordId", async () => {
    const encrypted = await encrypt("secret", "record-correct");
    await expect(decrypt(encrypted, "record-wrong")).rejects.toThrow();
  });

  it("throws when ciphertext is tampered with", async () => {
    const encrypted = await encrypt("secret data", "record-tamper");
    // Decode, flip a byte in the middle, re-encode
    const buf = Buffer.from(encrypted, "base64");
    const mid = Math.floor(buf.length / 2);
    buf[mid] ^= 0xff;
    const tampered = buf.toString("base64");
    await expect(decrypt(tampered, "record-tamper")).rejects.toThrow();
  });

  it("round-trips an empty string", async () => {
    const encrypted = await encrypt("", "record-empty");
    const decrypted = await decrypt(encrypted, "record-empty");
    expect(decrypted).toBe("");
  });

  it("round-trips unicode content", async () => {
    const plaintext = "Ångström café — 日本語テスト 🧠💡 ñoño";
    const encrypted = await encrypt(plaintext, "record-unicode");
    const decrypted = await decrypt(encrypted, "record-unicode");
    expect(decrypted).toBe(plaintext);
  });

  it("round-trips large content (50k characters)", async () => {
    const plaintext = "A".repeat(50_000);
    const encrypted = await encrypt(plaintext, "record-large");
    const decrypted = await decrypt(encrypted, "record-large");
    expect(decrypted).toBe(plaintext);
  });
});

describe("encryptBuffer / decryptBuffer", () => {
  it("round-trips a binary buffer", async () => {
    const original = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const encrypted = await encryptBuffer(original, "record-buf");
    const decrypted = await decryptBuffer(encrypted, "record-buf");
    expect(Buffer.compare(decrypted, original)).toBe(0);
  });
});

describe("isEncrypted", () => {
  it("returns true for an encrypted string", async () => {
    const encrypted = await encrypt("test", "record-check");
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("returns false for plaintext strings", () => {
    expect(isEncrypted("just a normal string")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted("{}")).toBe(false);
  });

  it("returns false for short base64", () => {
    const shortB64 = Buffer.from("short").toString("base64");
    expect(isEncrypted(shortB64)).toBe(false);
  });
});

describe("missing master key", () => {
  it("throws a descriptive error when ENCRYPTION_MASTER_KEY is unset", async () => {
    process.env.ENCRYPTION_MASTER_KEY = "";
    await expect(encrypt("test", "record-nokey")).rejects.toThrow(
      "ENCRYPTION_MASTER_KEY"
    );
  });
});
