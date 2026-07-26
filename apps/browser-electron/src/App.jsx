import { useEffect, useCallback, useRef, useState } from 'react';
import { TabBar } from './components/TabBar';
import { NavigationBar } from './components/NavigationBar';
import { ContextMenu } from './components/ContextMenu';
import { useTabStore } from './stores/tabs';
import { useHistoryStore } from './stores/history';
import { useSettingsStore } from './stores/settings';
import { useDownloadsStore } from './stores/downloads';
import { useKeyboardShortcuts, useDownloads } from './hooks';
import { DEFAULT_HOME } from './utils/url';
import {
  startMemoryManager,
  stopMemoryManager,
  registerWebview,
  unregisterWebview,
  recordTabActivity,
  sleepTab,
  wakeTab,
  getMemoryStats,
} from './services/memoryManager';
import { syncHistoryToGas } from './services/gasSync';

// ─── WebViewInstance per tab ─────────────────────────────────────────────────
// Optimized: Only mount active + sleeping tabs, reuse WebViews
function WebviewInstance({
  tab,
  isActive,
  onDomReady,
  onStartLoading,
  onFinishLoading,
  onTitleUpdate,
  onFaviconUpdate,
  onNavigationStateChange,
  onHistoryEntry,
}) {
  const webviewRef = useRef(null);
  const containerRef = useRef(null);
  const pendingUrlRef = useRef(null);
  const isSleepingRef = useRef(false);

  // Sync sleeping state to ref
  useEffect(() => {
    isSleepingRef.current = tab.isSleeping;
  }, [tab.isSleeping]);

  // Register webview with memory manager
  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) {
      registerWebview(tab.id, webview);

      // Cleanup on unmount
      return () => {
        unregisterWebview(tab.id);
      };
    }
  }, [tab.id]);

  // Inject style ke shadow-root supaya iframe ngisi penuh
  const injectShadowStyle = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    try {
      const shadowRoot = webview.shadowRoot;
      if (!shadowRoot) return;
      if (shadowRoot.querySelector('#wv-fix')) return;
      const style = document.createElement('style');
      style.id = 'wv-fix';
      style.textContent = `
        :host {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          width: 100% !important;
          min-height: 0 !important;
        }
        iframe {
          flex: 1 1 auto !important;
          height: 100% !important;
          width: 100% !important;
          border: none !important;
          min-height: 0 !important;
        }
      `;
      shadowRoot.appendChild(style);
    } catch (e) {}
  }, []);

  // ResizeObserver untuk sync height ke webview
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncHeight = () => {
      const webview = webviewRef.current;
      if (!webview) return;
      const h = container.getBoundingClientRect().height;
      if (h > 0) {
        webview.style.height = `${h}px`;
      }
      injectShadowStyle();
    };

    const ro = new ResizeObserver(syncHeight);
    ro.observe(container);
    syncHeight();
    return () => ro.disconnect();
  }, [injectShadowStyle]);

  // Navigasi: kalau URL berubah dari store, load via setAttribute
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || isSleepingRef.current) return;

    const currentSrc = webview.getAttribute('src');
    if (tab.url && tab.url !== currentSrc) {
      if (webview.loadURL) {
        webview.loadURL(tab.url).catch(() => {
          webview.setAttribute('src', tab.url);
        });
      } else {
        pendingUrlRef.current = tab.url;
      }
    }
  }, [tab.url, tab.isSleeping]);

  // Event listeners webview
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDomReady = () => {
      injectShadowStyle();

      if (containerRef.current) {
        const h = containerRef.current.getBoundingClientRect().height;
        if (h > 0) webview.style.height = `${h}px`;
      }

      if (pendingUrlRef.current) {
        const url = pendingUrlRef.current;
        pendingUrlRef.current = null;
        webview.loadURL(url).catch(() => webview.setAttribute('src', url));
      }

      onDomReady?.(tab.id);
    };

    const handleStartLoading = () => {
      onStartLoading?.(tab.id);
    };

    const handleFinishLoading = () => {
      onFinishLoading?.(tab.id);
      onNavigationStateChange?.(tab.id, {
        canGoBack: webview.canGoBack?.() ?? false,
        canGoForward: webview.canGoForward?.() ?? false,
      });
    };

    const handleTitleUpdated = (e) => onTitleUpdate?.(tab.id, e.title);
    const handleFavicon = (e) => {
      if (e.favicons?.length > 0) onFaviconUpdate?.(tab.id, e.favicons[0]);
    };

    const handleWillNavigate = (e) => {
      if (e.url && e.url !== tab.url) {
        onNavigationStateChange?.(tab.id, { url: e.url });
        onHistoryEntry?.(e.url, e.title);
      }
    };

    const handleDidNavigate = (e) => {
      if (e.url) {
        onHistoryEntry?.(e.url, webview.getTitle?.() || '');
        onNavigationStateChange?.(tab.id, {
          url: e.url,
          canGoBack: webview.canGoBack?.() ?? false,
          canGoForward: webview.canGoForward?.() ?? false,
        });
      }
    };

    // ─── Activity Recording for Tab Sleeping ─────────────────────────────────
    const handleActivity = () => {
      recordTabActivity(tab.id);
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-finish-load', handleFinishLoading);
    webview.addEventListener('page-title-updated', handleTitleUpdated);
    webview.addEventListener('page-favicon-updated', handleFavicon);
    webview.addEventListener('will-navigate', handleWillNavigate);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);

    // Activity events for tab sleeping
    webview.addEventListener('did-finish-load', handleActivity);
    webview.addEventListener('will-navigate', handleActivity);
    webview.addEventListener('did-navigate', handleActivity);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('did-finish-load', handleFinishLoading);
      webview.removeEventListener('page-title-updated', handleTitleUpdated);
      webview.removeEventListener('page-favicon-updated', handleFavicon);
      webview.removeEventListener('will-navigate', handleWillNavigate);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);

      webview.removeEventListener('did-finish-load', handleActivity);
      webview.removeEventListener('will-navigate', handleActivity);
      webview.removeEventListener('did-navigate', handleActivity);
    };
  }, [tab.id, tab.url, injectShadowStyle, onDomReady, onStartLoading, onFinishLoading, onTitleUpdate, onFaviconUpdate, onNavigationStateChange, onHistoryEntry]);

  // Expose webview ref ke parent lewat data attribute
  useEffect(() => {
    const container = containerRef.current;
    if (container) container._webviewRef = webviewRef;
  }, []);

  // ─── Sleep State UI ──────────────────────────────────────────────────────────
  // When sleeping, show a placeholder instead of the webview
  if (tab.isSleeping) {
    return (
      <div
        ref={containerRef}
        data-tab-id={tab.id}
        style={{
          position: 'absolute',
          inset: 0,
          display: isActive ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#666',
          }}
        >
          <svg
            className="w-12 h-12 mb-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
          <p className="text-sm">Tab Sleeping</p>
          <p className="text-xs text-gray-500 mt-1">{tab.title}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-tab-id={tab.id}
      style={{
        position: 'absolute',
        inset: 0,
        display: isActive ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <webview
        ref={webviewRef}
        src={tab.url || DEFAULT_HOME}
        partition="persist:browser"
        allowpopups="true"
        style={{
          width: '100%',
          flex: '1 1 auto',
          minHeight: 0,
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}

// ─── App utama ────────────────────────────────────────────────────────────────
function App() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const setActiveTabId = useTabStore((s) => s.setActiveTabId);
  const addTab = useTabStore((s) => s.addTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const updateTab = useTabStore((s) => s.updateTab);
  const navigate = useTabStore((s) => s.navigate);
  const sleepTabAction = useTabStore((s) => s.sleepTab);
  const wakeTabAction = useTabStore((s) => s.wakeTab);

  const addHistoryItem = useHistoryStore((s) => s.addItem);
  const historyEnabled = useHistoryStore((s) => s.isEnabled);
  const historyDownloadSettings = useSettingsStore((s) => s.historyDownload);

  const webviewContainerRef = useRef(null);
  const syncIntervalRef = useRef(null);
  const [memoryStats, setMemoryStats] = useState(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // ─── Ensure Active Tab is Always Set ─────────────────────────────────────────
  useEffect(() => {
    // If no active tab but we have tabs, set the first one as active
    if (!activeTabId && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs, setActiveTabId]);

  // ─── Memory Manager Lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    // Start memory manager
    startMemoryManager();

    // Log memory stats periodically
    const statsInterval = setInterval(() => {
      const stats = getMemoryStats();
      setMemoryStats(stats);
    }, 30000);

    return () => {
      stopMemoryManager();
      clearInterval(statsInterval);
    };
  }, []);

  // ─── Auto-sync to GAS ──────────────────────────────────────────────────────
  useEffect(() => {
    // Cleanup previous interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    // Setup auto-sync if enabled
    if (historyDownloadSettings.enabled && historyDownloadSettings.autoSync && historyDownloadSettings.gasUrl) {
      const intervalMs = (historyDownloadSettings.syncInterval || 30) * 60 * 1000;
      syncIntervalRef.current = setInterval(async () => {
        const items = useHistoryStore.getState().items;
        if (items.length > 0) {
          try {
            await syncHistoryToGas(items, historyDownloadSettings.gasUrl);
            console.log('Auto-sync: History synced to GAS');
          } catch (err) {
            console.error('Auto-sync failed:', err);
          }
        }
      }, intervalMs);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [historyDownloadSettings.enabled, historyDownloadSettings.autoSync, historyDownloadSettings.gasUrl, historyDownloadSettings.syncInterval]);

  // ─── Download handling (via hook) ──────────────────────────────────────────────
  useDownloads();

  // ─── Context Menu State ─────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, linkUrl: null });

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      linkUrl: null, // Will be populated by webview if on a link
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, linkUrl: null });
  }, []);

  // ─── Callbacks webview events ──────────────────────────────────────────────
  const handleDomReady = useCallback((tabId) => {
    updateTab(tabId, { isLoading: false });
  }, [updateTab]);

  const handleStartLoading = useCallback((tabId) => {
    updateTab(tabId, { isLoading: true });
  }, [updateTab]);

  const handleFinishLoading = useCallback((tabId) => {
    updateTab(tabId, { isLoading: false });
  }, [updateTab]);

  const handleTitleUpdate = useCallback((tabId, title) => {
    if (title) updateTab(tabId, { title });
  }, [updateTab]);

  const handleFaviconUpdate = useCallback((tabId, favicon) => {
    if (favicon) updateTab(tabId, { favicon });
  }, [updateTab]);

  const handleNavigationStateChange = useCallback((tabId, state) => {
    updateTab(tabId, state);
  }, [updateTab]);

  // ─── Add to history ───────────────────────────────────────────────────────
  const handleHistoryEntry = useCallback((url, title) => {
    if (historyEnabled && url && url.startsWith('http')) {
      addHistoryItem(url, title || '');
    }
  }, [historyEnabled, addHistoryItem]);

  // ─── Helper: ambil webview element dari container ─────────────────────────
  const getActiveWebview = useCallback(() => {
    const container = webviewContainerRef.current;
    if (!container) return null;
    const activeDiv = container.querySelector(`[data-tab-id="${activeTabId}"]`);
    if (!activeDiv) return null;
    return activeDiv.querySelector('webview');
  }, [activeTabId]);

  // ─── Tab Click Handler - Wake Sleeping Tabs ─────────────────────────────────
  const handleTabClick = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId);

    // If tab is sleeping, wake it first
    if (tab?.isSleeping) {
      wakeTabAction(tabId);
    }

    setActiveTab(tabId);
  }, [tabs, setActiveTab, wakeTabAction]);

  // ─── Navigation actions ───────────────────────────────────────────────────
  const goBack = useCallback(() => {
    const wv = getActiveWebview();
    if (wv?.canGoBack?.()) wv.goBack();
  }, [getActiveWebview]);

  const goForward = useCallback(() => {
    const wv = getActiveWebview();
    if (wv?.canGoForward?.()) wv.goForward();
  }, [getActiveWebview]);

  const reload = useCallback(() => {
    const wv = getActiveWebview();
    if (wv) wv.reload();
  }, [getActiveWebview]);

  // ─── Tab handlers ─────────────────────────────────────────────────────────
  const handleNewTab = useCallback(() => {
    addTab(DEFAULT_HOME);
  }, [addTab]);

  const handleCloseTab = useCallback((tabId) => {
    removeTab(tabId);
  }, [removeTab]);

  const handleNavigate = useCallback((tabId, url) => {
    // Wake tab if sleeping before navigating
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.isSleeping) {
      wakeTabAction(tabId);
    }
    navigate(tabId, url);
  }, [tabs, navigate, wakeTabAction]);

  // ─── Keyboard shortcuts (after callbacks defined) ─────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { restoreSession } = useKeyboardShortcuts({
    onNewTab: handleNewTab,
    onCloseTab: handleCloseTab,
    onReload: reload,
    onGoBack: goBack,
    onGoForward: goForward,
    getActiveWebview,
  });

  // ─── Optimized Tab Rendering ────────────────────────────────────────────────
  // Only render tabs that are active, recently used, or not sleeping
  // This prevents mounting too many WebViews at once
  const renderableTabs = tabs.filter((tab) => {
    // Always render active tab
    if (tab.id === activeTabId) return true;

    // Render sleeping tabs (for quick wake)
    if (tab.isSleeping) return true;

    // Render recently accessed tabs (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (tab.lastAccessedAt > fiveMinutesAgo) return true;

    return false;
  });

  return (
    <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden' }} onContextMenu={handleContextMenu}>
      {/* Tab Bar */}
      <TabBar
        onTabClick={handleTabClick}
        onNewTab={handleNewTab}
        onCloseTab={handleCloseTab}
      />

      {/* Navigation Bar */}
      <NavigationBar
        onBack={goBack}
        onForward={goForward}
        onReload={reload}
        onNavigate={handleNavigate}
        onNewTab={handleNewTab}
        activeTab={activeTab}
        webviewContainerRef={webviewContainerRef}
        activeTabId={activeTabId}
      />

      {/* WebView Container — optimized rendering */}
      <div
        ref={webviewContainerRef}
        style={{ flex: '1 1 0%', minHeight: 0, position: 'relative', overflow: 'hidden' }}
      >
        {renderableTabs.map((tab) => (
          <WebviewInstance
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onDomReady={handleDomReady}
            onStartLoading={handleStartLoading}
            onFinishLoading={handleFinishLoading}
            onTitleUpdate={handleTitleUpdate}
            onFaviconUpdate={handleFaviconUpdate}
            onNavigationStateChange={handleNavigationStateChange}
            onHistoryEntry={handleHistoryEntry}
          />
        ))}
      </div>

      {/* Context Menu */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        linkUrl={contextMenu.linkUrl}
        onClose={closeContextMenu}
        onNavigate={handleNavigate}
      />

      {/* Debug: Memory Stats (hidden in production) */}
      {process.env.NODE_ENV === 'development' && memoryStats && (
        <div className="fixed bottom-2 left-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-mono">
          Tabs: {memoryStats.awakeCount}/{memoryStats.totalTabs} awake |
          RAM: ~{memoryStats.totalMemoryMB}MB
        </div>
      )}
    </div>
  );
}

export default App;
