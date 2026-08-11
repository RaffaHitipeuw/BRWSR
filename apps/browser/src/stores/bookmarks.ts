// Bookmarks store - optimized with memory management

import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_BOOKMARKS = 50; // Kurangin dari 200 ke 50

interface BookmarkItem {
  id: string;
  url: string;
  title: string;
  favicon: string;
  createdAt: number;
}

interface BookmarksStore {
  items: BookmarkItem[];
  addBookmark: (url: string, title?: string, favicon?: string) => boolean;
  removeBookmark: (id: string) => void;
  removeByUrl: (url: string) => void;
  updateBookmark: (id: string, updates: Partial<BookmarkItem>) => void;
  clearAll: () => void;
  toggleBookmark: (url: string, title: string, favicon: string) => boolean;
  isBookmarked: (url: string) => boolean;
  getBookmark: (id: string) => BookmarkItem | undefined;
  search: (query: string) => BookmarkItem[];
}

export const useBookmarksStore = create<BookmarksStore>()(
  persist(
    (set, get) => ({
      items: [],

      addBookmark: (url, title = "", favicon = "") => {
        if (get().items.some((item) => item.url === url)) return false;

        const newBookmark: BookmarkItem = {
          id: `bm-${Date.now()}`,
          url,
          title: title || url,
          favicon,
          createdAt: Date.now(),
        };

        set((state) => {
          let newItems = [newBookmark, ...state.items];
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
          items: state.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
        }));
      },

      clearAll: () => set({ items: [] }),

      toggleBookmark: (url, title, favicon) => {
        if (get().isBookmarked(url)) {
          get().removeByUrl(url);
          return false;
        }
        get().addBookmark(url, title, favicon);
        return true;
      },

      isBookmarked: (url) => get().items.some((item) => item.url === url),
      getBookmark: (id) => get().items.find((item) => item.id === id),

      search: (query) => {
        const q = query.toLowerCase();
        return get().items.filter(
          (item) => item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q),
        );
      },
    }),
    {
      name: "eduos-browser-bookmarks",
      partialize: (state) => ({
        items: state.items.slice(0, MAX_BOOKMARKS),
      }),
    },
  ),
);
