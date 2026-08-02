// useKeyboardShortcuts - unified keyboard shortcuts

import { useEffect, useCallback } from 'react';
import { useTabStore } from '../stores/tabs';
import { useSessionStore } from '../stores/session';

export function useKeyboardShortcuts({
  onNewTab,
  onCloseTab,
  onReload,
  onGoBack,
  onGoForward,
}: {
  onNewTab?: () => void;
  onCloseTab?: (tabId: string) => void;
  onReload?: () => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
}) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setTabs = useTabStore((s) => s.setTabs as any);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const restoreTab = useTabStore((s) => s.restoreTab);
  const getClosedTabs = useTabStore((s) => s.getClosedTabs);
  const saveSession = useSessionStore((s) => s.saveSession);
  const getLastSession = useSessionStore((s) => s.getLastSession);
  const clearSession = useSessionStore((s) => s.clearSession);

  // Restore session function
  const restoreSession = useCallback(() => {
    const lastSession = getLastSession();
    if (lastSession && lastSession.tabs && lastSession.tabs.length > 0) {
      const tabsToRestore = lastSession.tabs.map((t: any, i: number) => ({
        id: `tab-${Date.now()}-${i}`,
        url: t.url,
        title: t.title || t.url,
        favicon: t.favicon || '',
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
      setTabs(tabsToRestore);
      if (tabsToRestore.length > 0) {
        setActiveTab(tabsToRestore[0].id);
      }
      clearSession();
      console.log('Session restored:', tabsToRestore.length, 'tabs');
      return true;
    }
    return false;
  }, [getLastSession, setTabs, setActiveTab, clearSession]);

  // Save session on unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (tabs.length > 0) {
        saveSession(tabs, activeTabId);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tabs, activeTabId, saveSession]);

  // Register keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.isContentEditable;

      // Skip if typing in input
      if (isInput) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+T: New tab
      if (ctrl && e.key === 't') {
        e.preventDefault();
        onNewTab?.();
        return;
      }

      // Ctrl+W: Close tab
      if (ctrl && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) onCloseTab?.(activeTabId);
        return;
      }

      // Ctrl+R: Reload
      if (ctrl && e.key === 'r') {
        e.preventDefault();
        onReload?.();
        return;
      }

      // F5: Reload
      if (e.key === 'F5') {
        e.preventDefault();
        onReload?.();
        return;
      }

      // Alt+Left: Back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        onGoBack?.();
        return;
      }

      // Alt+Right: Forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        onGoForward?.();
        return;
      }

      // Ctrl+Shift+T: Restore last closed tab, or session if no closed tabs
      if (ctrl && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        // Try to restore individual closed tab first
        const restored = restoreTab();
        if (restored) {
          console.log('Restored closed tab:', restored.url);
        } else {
          // Fall back to session restore
          restoreSession();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTabId,
    onNewTab,
    onCloseTab,
    onReload,
    onGoBack,
    onGoForward,
    restoreSession
  ]);

  return { restoreSession };
}
