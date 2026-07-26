// useSession - hook for session management

import { useCallback } from 'react';
import { useSessionStore } from '../stores/session';
import { useTabStore } from '../stores/tabs';

export function useSession() {
  const saveSession = useSessionStore((s) => s.saveSession);
  const getLastSession = useSessionStore((s) => s.getLastSession);
  const clearSession = useSessionStore((s) => s.clearSession);

  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setTabs = useTabStore((s) => s.setTabs);
  const setActiveTabId = useTabStore((s) => s.setActiveTabId);

  // Save current session
  const save = useCallback(() => {
    if (tabs.length > 0) {
      saveSession(tabs, activeTabId);
    }
  }, [tabs, activeTabId, saveSession]);

  // Restore last session
  const restore = useCallback(() => {
    const lastSession = getLastSession();
    if (lastSession && lastSession.tabs && lastSession.tabs.length > 0) {
      const tabsToRestore = lastSession.tabs.map((t, i) => ({
        id: `tab-${Date.now()}-${i}`,
        url: t.url,
        title: t.title || t.url,
        favicon: t.favicon || '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      }));
      setTabs(tabsToRestore);
      if (tabsToRestore.length > 0) {
        setActiveTabId(tabsToRestore[0].id);
      }
      clearSession();
      console.log('Session restored:', tabsToRestore.length, 'tabs');
      return true;
    }
    return false;
  }, [getLastSession, setTabs, setActiveTabId, clearSession]);

  // Get last session info
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
