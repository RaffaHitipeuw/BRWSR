
import { useCallback } from "react";
import { useSessionStore } from "../stores/session";
import { useTabStore } from "../stores/tabs";
import type { Tab } from "../stores/types";

interface SessionTab {
  url: string;
  title?: string;
  favicon?: string;
}

export function useSession() {
  const saveSession = useSessionStore((s) => s.saveSession);
  const getLastSession = useSessionStore((s) => s.getLastSession);
  const clearSession = useSessionStore((s) => s.clearSession);

  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setTabs = useTabStore((s) => s.setTabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);

  const save = useCallback(() => {
    if (tabs.length > 0) {
      saveSession(tabs, activeTabId);
    }
  }, [tabs, activeTabId, saveSession]);

  const restore = useCallback(() => {
    const lastSession = getLastSession();
    if (lastSession && lastSession.tabs && lastSession.tabs.length > 0) {
      const tabsToRestore = (lastSession.tabs as SessionTab[]).map((t, i) => ({
        id: `tab-${Date.now()}-${i}`,
        url: t.url,
        title: t.title || t.url,
        favicon: t.favicon || "",
        history: [t.url],
        historyIndex: 0,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        isPinned: false,
        isMuted: false,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      }));
      setTabs(tabsToRestore as Tab[]);
      if (tabsToRestore.length > 0) {
        setActiveTab(tabsToRestore[0].id);
      }
      clearSession();
      console.log("Session restored:", tabsToRestore.length, "tabs");
      return true;
    }
    return false;
  }, [getLastSession, setTabs, setActiveTab, clearSession]);

  const getLastSessionInfo = useCallback(() => {
    const session = getLastSession();
    if (!session) return null;
    return {
      tabCount: session.tabs?.length || 0,
      savedAt: session.savedAt,
    };
  }, [getLastSession]);

  return {
    save,
    restore,
    clear: clearSession,
    getLastSessionInfo,
    hasSession: !!getLastSession(),
  };
}
