// Downloads store - simplified and clean

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

let downloadIdCounter = 0;

function generateDownloadId() {
  return `dl-${++downloadIdCounter}-${Date.now()}`;
}

export const useDownloadsStore = create(
  persist(
    (set, get) => ({
      items: [],

      // ─── CRUD ───────────────────────────────────────────────────────────────
      addDownload: (fileName, url, totalBytes = 0) => {
        const newItem = {
          id: generateDownloadId(),
          fileName,
          url,
          totalBytes,
          received: 0,
          status: 'downloading',
          startTime: Date.now(),
          endTime: null,
        };

        set((state) => ({
          items: [newItem, ...state.items],
        }));

        return newItem.id;
      },

      updateProgress: (id, received, totalBytes) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, received, totalBytes: totalBytes || item.totalBytes }
              : item
          ),
        }));
      },

      completeDownload: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, status: 'completed', received: item.totalBytes, endTime: Date.now() }
              : item
          ),
        }));
      },

      cancelDownload: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status: 'cancelled', endTime: Date.now() } : item
          ),
        }));
      },

      interruptDownload: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status: 'interrupted', endTime: Date.now() } : item
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
          items: state.items.filter((item) => item.status !== 'completed'),
        }));
      },

      clearAll: () => set({ items: [] }),

      // ─── Queries ─────────────────────────────────────────────────────────────
      getDownload: (id) => get().items.find((item) => item.id === id),
      getByStatus: (status) => get().items.filter((item) => item.status === status),
      getTotalDownloaded: () => get().items.reduce((total, item) => total + item.received, 0),

      // ─── Format ─────────────────────────────────────────────────────────────
      formatBytes: (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
      },
    }),
    {
      name: 'eduos-browser-downloads',
      partialize: (state) => ({
        items: state.items.slice(0, 100),
      }),
    }
  )
);
