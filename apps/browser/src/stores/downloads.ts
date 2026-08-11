// Downloads store - simplified and clean

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DownloadItem {
  id: string;
  fileName: string;
  url: string;
  totalBytes: number;
  received: number;
  status: "downloading" | "completed" | "cancelled" | "interrupted";
  startTime: number;
  endTime: number | null;
}

interface DownloadsStore {
  items: DownloadItem[];
  addDownload: (fileName: string, url: string, totalBytes?: number) => string;
  updateProgress: (id: string, received: number, totalBytes?: number) => void;
  completeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  interruptDownload: (id: string) => void;
  removeDownload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  getDownload: (id: string) => DownloadItem | undefined;
  getByStatus: (status: string) => DownloadItem[];
  getTotalDownloaded: () => number;
  formatBytes: (bytes: number) => string;
}

let downloadIdCounter = 0;

export const useDownloadsStore = create<DownloadsStore>()(
  persist(
    (set, get) => ({
      items: [],

      addDownload: (fileName, url, totalBytes = 0) => {
        const id = `dl-${++downloadIdCounter}-${Date.now()}`;
        const newItem: DownloadItem = {
          id,
          fileName,
          url,
          totalBytes,
          received: 0,
          status: "downloading",
          startTime: Date.now(),
          endTime: null,
        };

        set((state) => ({
          items: [newItem, ...state.items],
        }));

        return id;
      },

      updateProgress: (id, received, totalBytes) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, received, totalBytes: totalBytes || item.totalBytes }
              : item,
          ),
        }));
      },

      completeDownload: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, status: "completed", received: item.totalBytes, endTime: Date.now() }
              : item,
          ),
        }));
      },

      cancelDownload: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status: "cancelled", endTime: Date.now() } : item,
          ),
        }));
      },

      interruptDownload: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status: "interrupted", endTime: Date.now() } : item,
          ),
        }));
      },

      removeDownload: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      clearCompleted: () => {
        set((state) => ({
          items: state.items.filter((item) => item.status !== "completed"),
        }));
      },

      clearAll: () => set({ items: [] }),

      getDownload: (id) => get().items.find((item) => item.id === id),
      getByStatus: (status) => get().items.filter((item) => item.status === status),
      getTotalDownloaded: () => get().items.reduce((total, item) => total + item.received, 0),

      formatBytes: (bytes) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
      },
    }),
    {
      name: "eduos-browser-downloads",
      partialize: (state) => ({
        items: state.items.slice(0, 20), // Limit to 20 items
      }),
    },
  ),
);
