// IndexedDB-backed photo storage for DigiCam.
// Stores processed JPEG blobs plus metadata. No network — all client-side,
// which keeps the app working offline and feels native.

import type { PresetId } from "./presets";

export interface PhotoMeta {
  id: string;
  blob: Blob;
  /** object-URL cache, populated on read for display */
  url?: string;
  width: number;
  height: number;
  createdAt: number;
  preset: PresetId;
  intensity: number;
  kind: "photo" | "video";
  /** for video captures, blob is webm */
  durationMs?: number;
}

const DB_NAME = "digicam";
const STORE = "photos";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("kind", "kind");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function savePhoto(meta: PhotoMeta): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    // Don't persist the transient object-URL.
    const { url, ...persist } = meta;
    void url;
    tx.objectStore(STORE).put(persist);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPhotos(): Promise<PhotoMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const photos = (req.result as PhotoMeta[]).sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      // Attach object URLs.
      for (const p of photos) {
        if (!p.url) p.url = URL.createObjectURL(p.blob);
      }
      resolve(photos);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllPhotos(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPhoto(id: string): Promise<PhotoMeta | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      const r = req.result as PhotoMeta | undefined;
      if (r && !r.url) r.url = URL.createObjectURL(r.blob);
      resolve(r ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Revoke all object URLs to avoid leaks (e.g. on full reload of the list). */
export function revokePhotos(photos: PhotoMeta[]) {
  for (const p of photos) {
    if (p.url) URL.revokeObjectURL(p.url);
  }
}
