import { create } from "zustand";
import type { CanvasEngine } from "@/canvas/CanvasEngine";

interface AppStore {
  engine: CanvasEngine | null;
  setEngine: (e: CanvasEngine | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useApp = create<AppStore>((set) => ({
  engine: null,
  setEngine: (engine) => set({ engine }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
