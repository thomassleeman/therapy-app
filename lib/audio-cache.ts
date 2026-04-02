/**
 * Thin IndexedDB wrapper for caching audio blobs between recording and
 * successful transcription. Allows retry after upload/processing failures
 * without forcing the therapist to re-record.
 *
 * Every public function catches internally — IndexedDB failures must never
 * block the recording/upload happy path.
 */

const DB_NAME = "therapy-audio-cache";
const STORE_NAME = "blobs";
const DB_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

interface CachedAudioEntry {
  sessionId: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
  createdAt: number;
}

// Lazy singleton — opened once, reused across calls.
let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // allow retry on next call
      reject(request.error);
    };
  });

  return dbPromise;
}

/** Persist an audio blob keyed by sessionId. Fire-and-forget from callers. */
export async function cacheAudioBlob(
  sessionId: string,
  blob: Blob,
  durationSec: number
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const entry: CachedAudioEntry = {
      sessionId,
      blob,
      mimeType: blob.type,
      durationSec,
      createdAt: Date.now(),
    };

    store.put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[audio-cache] Failed to cache blob:", err);
  }
}

/** Retrieve a cached blob for retry. Returns null if not found or on error. */
export async function getCachedAudio(
  sessionId: string
): Promise<{ blob: Blob; durationSec: number } | null> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(sessionId);

    const entry = await new Promise<CachedAudioEntry | undefined>(
      (resolve, reject) => {
        request.onsuccess = () =>
          resolve(request.result as CachedAudioEntry | undefined);
        request.onerror = () => reject(request.error);
      }
    );

    if (!entry) {
      return null;
    }
    return { blob: entry.blob, durationSec: entry.durationSec };
  } catch (err) {
    console.warn("[audio-cache] Failed to read cached blob:", err);
    return null;
  }
}

/** Delete a cached blob after successful transcription. */
export async function deleteCachedAudio(sessionId: string): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(sessionId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[audio-cache] Failed to delete cached blob:", err);
  }
}

/** Remove entries older than maxAgeMs. Returns count of deleted entries. */
export async function pruneStaleEntries(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<number> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    const entries = await new Promise<CachedAudioEntry[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as CachedAudioEntry[]);
      request.onerror = () => reject(request.error);
    });

    const cutoff = Date.now() - maxAgeMs;
    let deleted = 0;

    for (const entry of entries) {
      if (entry.createdAt < cutoff) {
        store.delete(entry.sessionId);
        deleted++;
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (deleted > 0) {
      console.info(`[audio-cache] Pruned ${deleted} stale entry(s)`);
    }
    return deleted;
  } catch (err) {
    console.warn("[audio-cache] Failed to prune stale entries:", err);
    return 0;
  }
}
