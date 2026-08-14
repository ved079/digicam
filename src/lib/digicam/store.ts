// Global app store for DigiCam — tab navigation, camera state, photos,
// and persistent settings. Single source of truth for the whole app.

"use client";

import { create } from "zustand";
import type { PresetId } from "./presets";
import type { PhotoMeta } from "./db";
import { getAllPhotos, savePhoto, deletePhoto as dbDelete } from "./db";

export type Tab = "camera" | "gallery" | "profile";

export interface DigiCamSettings {
  defaultPreset: PresetId;
  intensity: number; // 0..1
  saveLocation: "app" | "device";
  photoQuality: "standard" | "high";
  timestamp: boolean; // stamp timestamp on photos
  gridLines: boolean;
}

const DEFAULT_SETTINGS: DigiCamSettings = {
  defaultPreset: "powershot",
  intensity: 0.55,
  saveLocation: "app",
  photoQuality: "standard",
  timestamp: true,
  gridLines: false,
};

function loadSettings(): DigiCamSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem("digicam:settings");
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    // Validate the persisted preset id — migrate old/invalid values to the
    // new researched preset set (y2k→powershot, ccd→cybershot, film→exilim).
    const validIds: PresetId[] = ["powershot", "cybershot", "exilim", "cell"];
    const legacyMap: Record<string, PresetId> = {
      y2k: "powershot",
      ccd: "cybershot",
      film: "exilim",
      flash: "powershot",
    };
    if (!validIds.includes(parsed.defaultPreset)) {
      parsed.defaultPreset =
        legacyMap[parsed.defaultPreset as string] ?? DEFAULT_SETTINGS.defaultPreset;
    }
    return parsed;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(s: DigiCamSettings) {
  try {
    localStorage.setItem("digicam:settings", JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

interface DigiCamState {
  // navigation
  tab: Tab;
  setTab: (t: Tab) => void;

  // camera state
  facingMode: "user" | "environment";
  toggleFacing: () => void;
  flash: boolean;
  toggleFlash: () => void;
  timer: 0 | 3 | 10;
  cycleTimer: () => void;
  mode: "photo" | "video";
  toggleMode: () => void;
  recording: boolean;
  recordStart: number;
  recordMs: number;
  setRecording: (on: boolean, start?: number) => void;
  tickRecord: (ms: number) => void;

  preset: PresetId;
  setPreset: (p: PresetId) => void;

  // gallery
  photos: PhotoMeta[];
  selectedPhotoId: string | null;
  loadPhotos: () => Promise<void>;
  addPhoto: (p: PhotoMeta) => void;
  removePhoto: (id: string) => Promise<void>;
  selectPhoto: (id: string | null) => void;

  // settings
  settings: DigiCamSettings;
  updateSettings: (patch: Partial<DigiCamSettings>) => void;
  /** Re-load settings from localStorage on the client (avoids SSR mismatch). */
  hydrate: () => void;

  // transient UI
  toast: string | null;
  showToast: (msg: string) => void;
}

export const useDigiCam = create<DigiCamState>((set, get) => ({
  tab: "camera",
  setTab: (t) => set({ tab: t }),

  facingMode: "environment",
  toggleFacing: () =>
    set((s) => ({
      facingMode: s.facingMode === "user" ? "environment" : "user",
    })),
  flash: false,
  toggleFlash: () => set((s) => ({ flash: !s.flash })),
  timer: 0,
  cycleTimer: () =>
    set((s) => ({
      timer: s.timer === 0 ? 3 : s.timer === 3 ? 10 : 0,
    })),
  mode: "photo",
  toggleMode: () =>
    set((s) => ({ mode: s.mode === "photo" ? "video" : "photo" })),
  recording: false,
  recordStart: 0,
  recordMs: 0,
  setRecording: (on, start) =>
    set({
      recording: on,
      recordStart: start ?? 0,
      recordMs: 0,
    }),
  tickRecord: (ms) => set({ recordMs: ms }),

  preset: DEFAULT_SETTINGS.defaultPreset,
  setPreset: (p) => set({ preset: p }),

  photos: [],
  selectedPhotoId: null,
  loadPhotos: async () => {
    try {
      const photos = await getAllPhotos();
      set({ photos });
    } catch (e) {
      console.error("loadPhotos failed", e);
    }
  },
  addPhoto: (p) => set((s) => ({ photos: [p, ...s.photos] })),
  removePhoto: async (id) => {
    const prev = get().photos;
    set({ photos: prev.filter((p) => p.id !== id) });
    if (get().selectedPhotoId === id) set({ selectedPhotoId: null });
    try {
      await dbDelete(id);
    } catch (e) {
      console.error("delete failed", e);
      set({ photos: prev });
    }
  },
  selectPhoto: (id) => set({ selectedPhotoId: id }),

  // Use DEFAULT_SETTINGS for initial state (server + client render identically)
  // then hydrate from localStorage on the client via the `hydrate` action.
  settings: DEFAULT_SETTINGS,
  hydrate: () => {
    set({ settings: loadSettings(), preset: loadSettings().defaultPreset });
  },
  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    persistSettings(next);
    set({ settings: next });
    if (patch.defaultPreset) set({ preset: patch.defaultPreset });
  },

  toast: null,
  showToast: (msg) => {
    set({ toast: msg });
    window.setTimeout(() => set({ toast: null }), 2200);
  },
}));
