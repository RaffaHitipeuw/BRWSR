// History store - optimized with memory management

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_HISTORY_ITEMS = 100; // Kurangin dari 500 ke 100

interface HistoryItem {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  timestamp: number;
}

interface HistoryStore {
  items: HistoryItem[];
  isEnabled: boolean;
  addItem: (url: string, title?: string, favicon?: string | null) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  toggleEnabled: () => void;
  setEnabled: (enabled: boolean) => void;
  search: (query: string) => HistoryItem[];
  getByDateRange: (startDate: number, endDate: number) => HistoryItem[];
  getGroupedByDate: () => Record<string, HistoryItem[]>;
  exportAsCSV: () => string;
  exportAsJSON: () => string;
}

let historyIdCounter = 0;

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set, get) => ({
      items: [],
      isEnabled: true,

      addItem: (url, title = '', favicon = null) => {
        if (!get().isEnabled || !url?.startsWith('http')) return;

        const recentItems = get().items.slice(0, 10);
        const isDuplicate = recentItems.some(item => item.url === url);
        if (isDuplicate) return;

        const newItem: HistoryItem = {
          id: `history-${++historyIdCounter}-${Date.now()}`,
          url,
          title: title || url,
          favicon,
          timestamp: Date.now(),
        };

        set((state) => {
          let newItems = [newItem, ...state.items];
          if (newItems.length > MAX_HISTORY_ITEMS) {
            newItems = newItems.slice(0, MAX_HISTORY_ITEMS);
          }
          return { items: newItems };
        });
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      clear: () => set({ items: [] }),

      toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
      setEnabled: (enabled) => set({ isEnabled: enabled }),

      search: (query) => {
        const q = query.toLowerCase();
        return get().items.filter(
          (item) =>
            item.url.toLowerCase().includes(q) ||
            item.title?.toLowerCase().includes(q)
        );
      },

      getByDateRange: (startDate, endDate) => {
        return get().items.filter(
          (item) => item.timestamp >= startDate && item.timestamp <= endDate
        );
      },

      getGroupedByDate: () => {
        return get().items.reduce<Record<string, HistoryItem[]>>((acc, item) => {
          const date = new Date(item.timestamp).toLocaleDateString();
          if (!acc[date]) acc[date] = [];
          acc[date].push(item);
          return acc;
        }, {});
      },

      exportAsCSV: () => {
        const headers = ['Timestamp', 'Title', 'URL'];
        const rows = get().items.map((item) => [
          new Date(item.timestamp).toISOString(),
          `"${(item.title || '').replace(/"/g, '""')}"`,
          `"${(item.url || '').replace(/"/g, '""')}"`,
        ]);
        return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      },

      exportAsJSON: () => JSON.stringify(get().items, null, 2),
    }),
    {
      name: 'eduos-browser-history',
      partialize: (state) => ({
        items: state.items.slice(0, MAX_HISTORY_ITEMS),
        isEnabled: state.isEnabled,
      }),
    }
  )
);
