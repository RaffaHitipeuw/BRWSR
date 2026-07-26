// Session store - simplified and clean

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSessionStore = create(
  persist(
    (set, get) => ({
      lastSession: null,
      savedSessions: [],

      // ─── Session Management ─────────────────────────────────────────────────
      saveSession: (tabs, activeTabId) => {
        const session = {
          id: `session-${Date.now()}`,
          savedAt: Date.now(),
          tabs: tabs.map((tab) => ({
            url: tab.url,
            title: tab.title,
            favicon: tab.favicon,
          })),
          activeTabId,
        };

        set({ lastSession: session });

        // Keep last 10 sessions
        set((state) => ({
          savedSessions: [
            session,
            ...state.savedSessions.filter((s) => s.id !== session.id),
          ].slice(0, 10),
        }));

        return session;
      },

      getLastSession: () => get().lastSession,
      getSessionTabs: (sessionId) => {
        if (sessionId) {
          return get().savedSessions.find((s) => s.id === sessionId)?.tabs || [];
        }
        return get().lastSession?.tabs || [];
      },

      clearSession: () => set({ lastSession: null }),
      deleteSession: (sessionId) => {
        set((state) => ({
          savedSessions: state.savedSessions.filter((s) => s.id !== sessionId),
        }));
      },
      clearAllSessions: () => set({ savedSessions: [] }),
    }),
    {
      name: 'eduos-browser-session',
    }
  )
);
