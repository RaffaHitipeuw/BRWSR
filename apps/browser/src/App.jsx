import { useCallback, useEffect, useRef } from "react";
import {
  TabBar,
  NavigationBar,
  useKeyboardShortcuts,
  browser,
} from "./components";
import { useTabStore } from "./stores/tabs";
import { useSession } from "./hooks/useSession";
import { useHistoryStore } from "./stores/history";
import { StudentShareButton } from "./components/StudentShareButton";

function App() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const addTab = useTabStore((s) => s.addTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const tabs = useTabStore((s) => s.tabs);
  const navigate = useTabStore((s) => s.navigate);

  const { save } = useSession();

  const addToHistory = useHistoryStore((s) => s.addItem);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Track if initial WebView creation has happened
  const webViewInitialized = useRef(false);

  useEffect(() => {
    if (activeTab && activeTab.url && activeTab.url.startsWith("http")) {
      addToHistory(activeTab.url, activeTab.title, activeTab.favicon || null);
    }
  }, [activeTab?.url, activeTab?.title, addToHistory, activeTab]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      save();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [save]);

  // Only navigate on initial load to create WebView, NOT on tab switches
  useEffect(() => {
    if (activeTabId && activeTab && activeTab.url && !webViewInitialized.current) {
      webViewInitialized.current = true;
      browser.navigate(activeTab.url, activeTabId, "initial_load");
    }
  }, [activeTabId, activeTab?.url, activeTab]);

  const handleTabClick = useCallback(
    (tabId) => {
      setActiveTab(tabId);
    },
    [setActiveTab],
  );

  const handleNewTab = useCallback(() => {
    console.info("[NEW_TAB_01] + UI handler entered");
    console.info("[NEW_TAB_01] timestamp:", Date.now());
    try {
      console.info("[NEW_TAB_02] frontend tab state update started");
      const newTabId = addTab();
      console.info("[NEW_TAB_02] frontend tab state update completed, newTabId:", newTabId);
      console.info("[NEW_TAB_02] timestamp:", Date.now());
      if (newTabId) {
        console.info("[NEW_TAB_03] about to call backend createTab");
        console.info("[NEW_TAB_03] timestamp:", Date.now());
        browser.createTab(newTabId);
        console.info("[NEW_TAB_03] backend createTab called");
        console.info("[NEW_TAB_03] timestamp:", Date.now());
      }
    } catch (err) {
      console.error("[NEW_TAB_XX] UNCAUGHT EXCEPTION in handleNewTab:", err);
      console.error("[NEW_TAB_XX] timestamp:", Date.now());
    }
  }, [addTab]);

  const handleCloseTab = useCallback(
    (tabId) => {
      const state = useTabStore.getState();
      const wasActive = state.activeTabId === tabId;

      browser.closeTab(tabId);

      removeTab(tabId);

      const newActiveTab = useTabStore.getState().getActiveTab();
      if (newActiveTab && wasActive) {
        browser.navigate(newActiveTab.url, newActiveTab.id, "tab_switch");
      }
    },
    [removeTab],
  );

  const handleNavigate = useCallback(
    (tabId, url) => {
      navigate(tabId, url);
      browser.navigate(url, tabId, "typed_url");
    },
    [navigate],
  );

  const handleReload = useCallback(() => {
    browser.reload();
  }, []);

  const handleBack = useCallback(() => {
    browser.back();
  }, []);

  const handleForward = useCallback(() => {
    browser.forward();
  }, []);

  useKeyboardShortcuts({
    onNewTab: handleNewTab,
    onCloseTab: handleCloseTab,
    onReload: handleReload,
    onGoBack: handleBack,
    onGoForward: handleForward,
  });

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TabBar onTabClick={handleTabClick} onNewTab={handleNewTab} onCloseTab={handleCloseTab} />

      <NavigationBar
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onNavigate={handleNavigate}
        onNewTab={handleNewTab}
      />

      <StudentShareButton />
    </div>
  );
}

export default App;
