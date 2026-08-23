
import { useEffect, useCallback } from "react";
import { useTabStore } from "../stores/tabs";
import { useSessionStore } from "../stores/session";
import type { Tab } from "../stores/types";

interface SessionTab {
  url: string;
  title?: string;
  favicon?: string;
}

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
  const setTabs = useTabStore((s) => s.setTabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const restoreTab = useTabStore((s) => s.restoreTab);
  const saveSession = useSessionStore((s) => s.saveSession);
  const getLastSession = useSessionStore((s) => s.getLastSession);
  const clearSession = useSessionStore((s) => s.clearSession);

  const restoreSession = useCallback(() => {
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

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (tabs.length > 0) {
        saveSession(tabs, activeTabId);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [tabs, activeTabId, saveSession]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (isInput) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "t") {
        e.preventDefault();
        onNewTab?.();
        return;
      }

      if (ctrl && e.key === "w") {
        e.preventDefault();
        if (activeTabId) onCloseTab?.(activeTabId);
        return;
      }

      if (ctrl && e.key === "r") {
        e.preventDefault();
        onReload?.();
        return;
      }

      if (e.key === "F5") {
        e.preventDefault();
        onReload?.();
        return;
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        onGoBack?.();
        return;
      }

      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        onGoForward?.();
        return;
      }

      if (ctrl && e.shiftKey && e.key === "T") {
        e.preventDefault();
        const restored = restoreTab();
        if (restored) {
          console.log("Restored closed tab:", restored.url);
        } else {
          restoreSession();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTabId,
    onNewTab,
    onCloseTab,
    onReload,
    onGoBack,
    onGoForward,
    restoreSession,
    restoreTab,
  ]);

  return { restoreSession };
}
