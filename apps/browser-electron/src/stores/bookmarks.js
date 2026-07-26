// Bookmarks store - optimized with memory management

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_BOOKMARKS = 200;

export const useBookmarksStore = create(
  persist(
    (set, get) => ({
      items: [],

      // ─── CRUD ───────────────────────────────────────────────────────────────
      addBookmark: (url, title = '', favicon = '') => {
        // Check duplicates
        if (get().items.some((item) => item.url === url)) return false;

        const newBookmark = {
          id: `bm-${Date.now()}`,
          url,
          title: title || url,
          favicon,
          createdAt: Date.now(),
        };

        set((state) => {
          let newItems = [newBookmark, ...state.items];

          // Auto-trim if exceeds limit
          if (newItems.length > MAX_BOOKMARKS) {
            newItems = newItems.slice(0, MAX_BOOKMARKS);
          }

          return { items: newItems };
        });

        return true;
      },

      removeBookmark: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      removeByUrl: (url) => {
        set((state) => ({
          items: state.items.filter((item) => item.url !== url),
        }));
      },

      updateBookmark: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      clearAll: () => set({ items: [] }),

      // ─── Toggle ────────────────────────────────────────────────────────────
      toggleBookmark: (url, title, favicon) => {
        if (get().isBookmarked(url)) {
          get().removeByUrl(url);
          return false;
        }
        get().addBookmark(url, title, favicon);
        return true;
      },

      // ─── Queries ────────────────────────────────────────────────────────────
      isBookmarked: (url) => get().items.some((item) => item.url === url),
      getBookmark: (id) => get().items.find((item) => item.id === id),

      search: (query) => {
        const q = query.toLowerCase();
        return get().items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.url.toLowerCase().includes(q)
        );
      },
    }),
    {
      name: 'eduos-browser-bookmarks',
      partialize: (state) => ({
        items: state.items.slice(0, MAX_BOOKMARKS),
      }),
    }
  )
);
