// Session store - simplified and clean

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Session {
  id: string;
  savedAt: number;
  tabs: Array<{
    url: string;
    title?: string;
    favicon?: string;
  }>;
  activeTabId: string | null;
}

interface SessionStore {
  lastSession: Session | null;
  savedSessions: Session[];
  saveSession: (tabs: any[], activeTabId: string | null) => Session;
  getLastSession: () => Session | null;
  getSessionTabs: (sessionId?: string) => Array<{ url: string; title?: string; favicon?: string }>;
  clearSession: () => void;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      lastSession: null,
      savedSessions: [],

      saveSession: (tabs, activeTabId) => {
        const session = {
          id: `session-${Date.now()}`,
          savedAt: Date.now(),
          tabs: tabs.map((tab: any) => ({
            url: tab.url,
            title: tab.title,
            favicon: tab.favicon,
          })),
          activeTabId,
        };

        set({ lastSession: session });

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
