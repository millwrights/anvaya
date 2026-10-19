import { create } from "zustand";
import type { CanvasEngine } from "@/canvas/CanvasEngine";

interface AppStore {
  engine: CanvasEngine | null;
  setEngine: (e: CanvasEngine | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  historyOpen: boolean;
  setHistoryOpen: (v: boolean) => void;
  // Set while viewing a past version / diff (read-only); null = live editing.
  preview: { label: string; legend?: { color: string; text: string }[] } | null;
  setPreview: (v: AppStore["preview"]) => void;
}

export const useApp = create<AppStore>((set) => ({
  engine: null,
  setEngine: (engine) => set({ engine }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  aiOpen: false,
  setAiOpen: (aiOpen) => set({ aiOpen }),
  historyOpen: false,
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
