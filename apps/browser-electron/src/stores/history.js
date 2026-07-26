// History store - optimized with memory management

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_HISTORY_ITEMS = 500;

let historyIdCounter = 0;

function generateHistoryId() {
  return `history-${++historyIdCounter}-${Date.now()}`;
}

export const useHistoryStore = create(
  persist(
    (set, get) => ({
      items: [],
      isEnabled: true,

      // ─── CRUD ───────────────────────────────────────────────────────────────
      addItem: (url, title = '', favicon = null) => {
        if (!get().isEnabled || !url?.startsWith('http')) return;

        // Deduplication: skip if same URL exists in last 10 items
        const recentItems = get().items.slice(0, 10);
        const isDuplicate = recentItems.some(item => item.url === url);
        if (isDuplicate) return;

        const newItem = {
          id: generateHistoryId(),
          url,
          title: title || url,
          favicon,
          timestamp: Date.now(),
        };

        set((state) => {
          let newItems = [newItem, ...state.items];

          // Auto-trim if exceeds limit
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

      // ─── Settings ──────────────────────────────────────────────────────────
      toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
      setEnabled: (enabled) => set({ isEnabled: enabled }),

      // ─── Queries (memoized outside store) ─────────────────────────────────
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
        return get().items.reduce((acc, item) => {
          const date = new Date(item.timestamp).toLocaleDateString();
          if (!acc[date]) acc[date] = [];
          acc[date].push(item);
          return acc;
        }, {});
      },

      // ─── Export ──────────────────────────────────────────────────────────────
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
