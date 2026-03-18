import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { isEncrypted } from "../crypto";
import {
  decryptField,
  decryptJsonb,
  decryptSegments,
  encryptField,
  encryptJsonb,
  encryptSegments,
} from "../fields";

const TEST_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
});

afterEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
});

describe("encryptField / decryptField", () => {
  it("returns null for null input", async () => {
    expect(await encryptField(null, "rec-1")).toBeNull();
  });

  it("returns null for undefined input", async () => {
    expect(await encryptField(undefined, "rec-1")).toBeNull();
  });

  it("returns null for empty string input", async () => {
    expect(await encryptField("", "rec-1")).toBeNull();
  });

  it("round-trips a string through encrypt and decrypt", async () => {
    const original = "Client presented with moderate anxiety";
    const recordId = "rec-field-rt";
    const encrypted = await encryptField(original, recordId);
    expect(encrypted).not.toBeNull();
    const decrypted = await decryptField(encrypted, recordId);
    expect(decrypted).toBe(original);
  });

  it("passes through plaintext in decryptField", async () => {
    const plaintext = "This is not encrypted";
    const result = await decryptField(plaintext, "rec-passthrough");
    expect(result).toBe(plaintext);
  });
});

describe("encryptJsonb / decryptJsonb", () => {
  it("round-trips a JSON object", async () => {
    const original = {
      subjective: "Patient reports feeling better",
      objective: "Engaged well in session",
    };
    const recordId = "rec-jsonb-rt";
    const encrypted = await encryptJsonb(original, recordId);
    const decrypted = await decryptJsonb<typeof original>(encrypted, recordId);
    expect(decrypted).toEqual(original);
  });

  it("passes through a plain object without _encrypted key", async () => {
    const plain = { subjective: "plain", objective: "plain" };
    const result = await decryptJsonb<typeof plain>(plain, "rec-jsonb-pt");
    expect(result).toEqual(plain);
  });

  it("produces output with exactly one _encrypted string key", async () => {
    const encrypted = await encryptJsonb({ a: 1 }, "rec-jsonb-fmt");
    const keys = Object.keys(encrypted);
    expect(keys).toEqual(["_encrypted"]);
    expect(typeof encrypted._encrypted).toBe("string");
  });
});

describe("encryptSegments / decryptSegments", () => {
  const makeSegments = () => [
    { content: "Hello from segment 0", speaker: "therapist", startTimeMs: 0 },
    { content: "Hello from segment 1", speaker: "client", startTimeMs: 5000 },
    {
      content: "Hello from segment 2",
      speaker: "therapist",
      startTimeMs: 10_000,
    },
    { content: "Hello from segment 3", speaker: "client", startTimeMs: 15_000 },
    {
      content: "Hello from segment 4",
      speaker: "therapist",
      startTimeMs: 20_000,
    },
  ];

  it("round-trips segments preserving content and metadata", async () => {
    const originals = makeSegments();
    const sessionId = "session-seg-rt";

    const encrypted = await encryptSegments(originals, sessionId);

    // All content fields should differ from originals
    for (let i = 0; i < encrypted.length; i++) {
      expect(encrypted[i].content).not.toBe(originals[i].content);
      expect(isEncrypted(encrypted[i].content)).toBe(true);
      // Metadata unchanged
      expect(encrypted[i].speaker).toBe(originals[i].speaker);
      expect(encrypted[i].startTimeMs).toBe(originals[i].startTimeMs);
    }

    const decrypted = await decryptSegments(encrypted, sessionId);

    for (let i = 0; i < decrypted.length; i++) {
      expect(decrypted[i].content).toBe(originals[i].content);
      expect(decrypted[i].speaker).toBe(originals[i].speaker);
      expect(decrypted[i].startTimeMs).toBe(originals[i].startTimeMs);
    }
  });

  it("handles mixed encrypted and plaintext segments (migration)", async () => {
    const sessionId = "session-mixed";
    const originals = makeSegments();

    // Encrypt only segments 0, 2, 4
    const mixed = await Promise.all(
      originals.map(async (seg, i) => {
        if (i % 2 === 0) {
          const { encrypt } = await import("../crypto");
          return {
            ...seg,
            content: await encrypt(seg.content, `${sessionId}:segment:${i}`),
          };
        }
        return seg;
      })
    );

    const decrypted = await decryptSegments(mixed, sessionId);

    for (let i = 0; i < decrypted.length; i++) {
      expect(decrypted[i].content).toBe(originals[i].content);
    }
  });
});
