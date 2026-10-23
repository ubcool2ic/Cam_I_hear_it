/**
 * @file web/sample-store.js
 * @summary Automatic sample saving. After each recording app.js calls saveSample(payload, wav): the sample is first
 * written to an IndexedDB "pending samples" queue on this device, then, if UPLOAD_URL is set, POSTed there as
 * multipart/form-data (part "payload" = JSON, part "audio" = WAV) and removed from the queue on a 2xx reply.
 * UPLOAD_URL is empty until a server exists, so samples simply stay queued in the browser. flushPending() retries
 * the queue (app.js calls it on page load). Samples are only saved after the user accepted the Privacy Policy,
 * which discloses this (web/consent.js, privacy.html).
 */

/** Collection endpoint. Empty = no server yet: keep samples on this device. Set this when the backend exists. */
export const UPLOAD_URL = "";

const DB_NAME = "camihear";
const DB_VERSION = 1;
/** Object store of samples waiting to be uploaded: {id (autoIncrement), sampleId, savedAt, payload, audio: Blob}. */
export const PENDING_STORE = "pendingSamples";

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("IndexedDB not available")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Runs one request against the pending store and resolves with its result once the transaction commits.
 * @param {"readonly"|"readwrite"} mode
 * @param {(s: IDBObjectStore) => IDBRequest} fn
 */
async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, mode);
      const req = fn(tx.objectStore(PENDING_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/** @returns {Promise<Array<{id:number, sampleId:string, savedAt:string, payload:object, audio:Blob}>>} every queued sample. */
export const listPending = () => withStore("readonly", (s) => s.getAll());

/** @returns {Promise<number>} how many samples are queued. */
export const countPending = () => withStore("readonly", (s) => s.count());

/**
 * POSTs one sample to UPLOAD_URL. Resolves true on a 2xx reply.
 * @param {{payload: object, audio: Blob, sampleId: string}} rec
 */
async function upload(rec) {
  const form = new FormData();
  form.append("payload", new Blob([JSON.stringify(rec.payload)], { type: "application/json" }), `${rec.sampleId}.json`);
  form.append("audio", rec.audio, `${rec.sampleId}.wav`);
  const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
  return res.ok;
}

/**
 * Saves a sample automatically: queue it on this device, then try the upload if UPLOAD_URL is set.
 * @param {object} payload The upload payload (must carry payload.sampleId).
 * @param {Blob} audio WAV of the clip.
 * @returns {Promise<{status: "queued"|"uploaded"|"upload-failed", pending: number}>}
 *   "queued" = no server configured, kept on device; "upload-failed" = kept on device, will retry on next load.
 */
export async function saveSample(payload, audio) {
  const rec = { sampleId: payload.sampleId, savedAt: new Date().toISOString(), payload, audio };
  const id = await withStore("readwrite", (s) => s.add(rec));
  if (!UPLOAD_URL) return { status: "queued", pending: await countPending() };
  let ok = false;
  try { ok = await upload(rec); } catch { ok = false; }
  if (ok) await withStore("readwrite", (s) => s.delete(id));
  return { status: ok ? "uploaded" : "upload-failed", pending: await countPending() };
}

/**
 * Retries every queued sample (oldest first) when UPLOAD_URL is set; stops at the first failure.
 * @returns {Promise<{uploaded: number, pending: number}>}
 */
export async function flushPending() {
  let uploaded = 0;
  if (UPLOAD_URL) {
    for (const rec of await listPending()) {
      let ok = false;
      try { ok = await upload(rec); } catch { ok = false; }
      if (!ok) break;
      await withStore("readwrite", (s) => s.delete(rec.id));
      uploaded++;
    }
  }
  return { uploaded, pending: await countPending() };
}
