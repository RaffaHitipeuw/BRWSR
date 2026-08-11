// Settings store - simplified and clean

import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_SETTINGS = {
  theme: "light",
  zoom: 100,
  showHomeButton: true,
  searchEngine: "google",
  homepage: "https://www.google.com",
  startPage: "newTab",
  blockPopups: true,
  sendDoNotTrack: true,
  historyDownload: {
    enabled: false,
    gasUrl: "",
    autoSync: false,
    syncInterval: 30,
  },
  downloadPath: "",
  downloadPrompt: true,
};

interface SettingsStore {
  theme: string;
  zoom: number;
  showHomeButton: boolean;
  searchEngine: string;
  homepage: string;
  startPage: string;
  blockPopups: boolean;
  sendDoNotTrack: boolean;
  historyDownload: {
    enabled: boolean;
    gasUrl: string;
    autoSync: boolean;
    syncInterval: number;
  };
  downloadPath: string;
  downloadPrompt: boolean;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  toggleHome: () => void;
  setHomepage: (url: string) => void;
  resetHomepage: () => void;
  setSearchEngine: (engine: string) => void;
  setStartPage: (page: string) => void;
  setBlockPopups: (block: boolean) => void;
  setSendDoNotTrack: (send: boolean) => void;
  setHistoryDownloadEnabled: (enabled: boolean) => void;
  setGasUrl: (url: string) => boolean;
  setAutoSync: (autoSync: boolean) => void;
  setSyncInterval: (minutes: number) => void;
  setDownloadPath: (path: string) => void;
  setDownloadPrompt: (prompt: boolean) => void;
  resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setZoom: (zoom) => set({ zoom: Math.max(25, Math.min(200, zoom)) }),
      zoomIn: () => set((s) => ({ zoom: Math.min(200, s.zoom + 10) })),
      zoomOut: () => set((s) => ({ zoom: Math.max(25, s.zoom - 10) })),
      resetZoom: () => set({ zoom: 100 }),

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),

      toggleHome: () => set((s) => ({ showHomeButton: !s.showHomeButton })),
      setHomepage: (url) => set({ homepage: url }),
      resetHomepage: () => set({ homepage: DEFAULT_SETTINGS.homepage }),

      setSearchEngine: (engine) => set({ searchEngine: engine }),
      setStartPage: (page) => set({ startPage: page }),

      setBlockPopups: (block) => set({ blockPopups: block }),
      setSendDoNotTrack: (send) => set({ sendDoNotTrack: send }),

      setHistoryDownloadEnabled: (enabled) =>
        set((s) => ({
          historyDownload: { ...s.historyDownload, enabled },
        })),

      setGasUrl: (url) => {
        if (url && !url.includes("script.google.com")) {
          console.warn("Invalid GAS URL");
          return false;
        }
        set((s) => ({ historyDownload: { ...s.historyDownload, gasUrl: url } }));
        return true;
      },

      setAutoSync: (autoSync) =>
        set((s) => ({
          historyDownload: { ...s.historyDownload, autoSync },
        })),

      setSyncInterval: (minutes) =>
        set((s) => ({
          historyDownload: {
            ...s.historyDownload,
            syncInterval: Math.max(5, Math.min(1440, minutes)),
          },
        })),

      setDownloadPath: (path) => set({ downloadPath: path }),
      setDownloadPrompt: (prompt) => set({ downloadPrompt: prompt }),

      resetToDefaults: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: "eduos-browser-settings",
      partialize: (s) => ({
        theme: s.theme,
        zoom: s.zoom,
        showHomeButton: s.showHomeButton,
        searchEngine: s.searchEngine,
        homepage: s.homepage,
        startPage: s.startPage,
        blockPopups: s.blockPopups,
        sendDoNotTrack: s.sendDoNotTrack,
        historyDownload: s.historyDownload,
        downloadPath: s.downloadPath,
        downloadPrompt: s.downloadPrompt,
      }),
    },
  ),
);
