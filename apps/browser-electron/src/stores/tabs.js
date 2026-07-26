// Tabs store - with Tab Sleeping & Memory Management

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_HOME } from '../utils/url';

let tabCounter = 0;

function generateTabId() {
  return `tab-${++tabCounter}-${Date.now()}`;
}

function createTab(url = DEFAULT_HOME) {
  return {
    id: generateTabId(),
    title: 'New Tab',
    url,
    favicon: null,
    isLoading: true,
    canGoBack: false,
    canGoForward: false,
    // ─── Tab Sleeping ─────────────────────────────────────────────────────────
    isSleeping: false,
    sleepingSince: null,
    lastAccessedAt: Date.now(),
    // ─── Memory Management ───────────────────────────────────────────────────
    estimatedMemoryMB: 0,
    priority: 1, // 1 = high, 2 = medium, 3 = low (for sleep priority)
  };
}

// ─── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_SLEEP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_TABS = 20;
const MEMORY_LIMIT_PER_TAB_MB = 100;
const MAX_WAKE_TABS = 3; // Max tabs that can be awake simultaneously

// Create initial tab and get its ID
const initialTab = createTab();
const INITIAL_ACTIVE_TAB_ID = initialTab.id;

export const useTabStore = create(
  persist(
    (set, get) => ({
      tabs: [initialTab],
      activeTabId: INITIAL_ACTIVE_TAB_ID,

      // ─── Config ────────────────────────────────────────────────────────────
      sleepTimeout: DEFAULT_SLEEP_TIMEOUT_MS,
      maxTabs: DEFAULT_MAX_TABS,
      enableTabSleeping: true,

      // ─── Tab Management ────────────────────────────────────────────────────
      setTabs: (tabs) => set({ tabs }),
      setActiveTabId: (tabId) => set({ activeTabId: tabId }),
      setActiveTab: (tabId) => set({ activeTabId: tabId }),

      addTab: (url = DEFAULT_HOME, options = {}) => {
        const state = get();

        // Enforce memory limits - auto-sleep if too many awake tabs
        if (state.enableTabSleeping) {
          const awakeTabs = state.tabs.filter(t => !t.isSleeping);
          if (awakeTabs.length >= MAX_WAKE_TABS) {
            // Sleep the least recently accessed awake tab
            const toSleep = awakeTabs
              .filter(t => t.id !== state.activeTabId)
              .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)[0];
            if (toSleep) {
              set(s => ({
                tabs: s.tabs.map(t =>
                  t.id === toSleep.id
                    ? { ...t, isSleeping: true, sleepingSince: Date.now() }
                    : t
                ),
              }));
            }
          }
        }

        // Enforce max tabs
        if (state.tabs.length >= state.maxTabs) {
          const closableTabs = state.tabs
            .filter(t => !t.isSleeping && t.id !== state.activeTabId)
            .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
          if (closableTabs.length > 0) {
            // Close the oldest tab
            const toRemove = closableTabs[0];
            set(s => ({
              tabs: s.tabs.filter(t => t.id !== toRemove.id),
            }));
          }
        }

        const newTab = createTab(url);
        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        }));
        return newTab.id;
      },

      removeTab: (tabId) => {
        const state = get();
        if (state.tabs.length === 1) return;

        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId);

          let newActiveTabId = state.activeTabId;
          if (state.activeTabId === tabId && newTabs.length > 0) {
            const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
            newActiveTabId = newTabs[Math.max(0, tabIndex - 1)]?.id;
          }

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
          };
        });
      },

      updateTab: (tabId, updates) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, ...updates, lastAccessedAt: Date.now() }
              : tab
          ),
        }));
      },

      navigate: (tabId, url) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, url, lastAccessedAt: Date.now(), isSleeping: false, sleepingSince: null }
              : tab
          ),
        }));
      },

      // ─── Tab Sleeping ────────────────────────────────────────────────────
      sleepTab: (tabId) => {
        const state = get();
        const tab = state.tabs.find(t => t.id === tabId);
        if (!tab || tab.isSleeping) return;

        // Don't sleep the active tab
        if (tabId === state.activeTabId) return;

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? { ...t, isSleeping: true, sleepingSince: Date.now(), priority: 3 }
              : t
          ),
        }));
      },

      wakeTab: (tabId) => {
        const state = get();

        // Count currently awake tabs (excluding the one we're waking)
        const awakeCount = state.tabs.filter(t => !t.isSleeping && t.id !== tabId).length;

        if (state.enableTabSleeping && awakeCount >= MAX_WAKE_TABS) {
          // Need to sleep another tab first
          const tabsToSleep = state.tabs
            .filter(t => !t.isSleeping && t.id !== state.activeTabId && t.id !== tabId)
            .sort((a, b) => a.priority - b.priority || a.lastAccessedAt - b.lastAccessedAt);

          if (tabsToSleep.length > 0) {
            get().sleepTab(tabsToSleep[0].id);
          }
        }

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? { ...t, isSleeping: false, sleepingSince: null, lastAccessedAt: Date.now(), priority: 1 }
              : t
          ),
        }));
      },

      sleepAllInactive: () => {
        const state = get();
        const activeId = state.activeTabId;

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id !== activeId && !t.isSleeping
              ? { ...t, isSleeping: true, sleepingSince: Date.now(), priority: 3 }
              : t
          ),
        }));
      },

      // ─── Memory Management ─────────────────────────────────────────────────
      updateTabMemory: (tabId, estimatedMB) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, estimatedMemoryMB: estimatedMB } : tab
          ),
        }));
      },

      setTabPriority: (tabId, priority) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, priority } : tab
          ),
        }));
      },

      enforceMemoryLimits: () => {
        const state = get();
        const totalMemory = state.tabs.reduce((sum, t) => sum + t.estimatedMemoryMB, 0);
        const limit = state.maxTabs * MEMORY_LIMIT_PER_TAB_MB;

        if (totalMemory <= limit) return; // All good

        // Need to sleep some tabs
        const sleepingTabs = state.tabs.filter(t => t.isSleeping);
        const awakeTabs = state.tabs.filter(t => !t.isSleeping);

        // Sleep tabs by priority (lowest priority first), excluding active tab
        const tabsToSleep = awakeTabs
          .filter(t => t.id !== state.activeTabId)
          .sort((a, b) => a.priority - b.priority || a.lastAccessedAt - b.lastAccessedAt);

        let memoryToFree = totalMemory - limit;
        let sleptTabs = [];

        for (const tab of tabsToSleep) {
          if (memoryToFree <= 0) break;
          memoryToFree -= tab.estimatedMemoryMB || MEMORY_LIMIT_PER_TAB_MB;
          sleptTabs.push(tab.id);
        }

        if (sleptTabs.length > 0) {
          set(s => ({
            tabs: s.tabs.map(t =>
              sleptTabs.includes(t.id)
                ? { ...t, isSleeping: true, sleepingSince: Date.now(), priority: 3 }
                : t
            ),
          }));
        }
      },

      // ─── Config ────────────────────────────────────────────────────────────
      setSleepTimeout: (ms) => set({ sleepTimeout: ms }),
      setMaxTabs: (max) => {
        set({ maxTabs: max });
        get().enforceMemoryLimits();
      },
      setEnableTabSleeping: (enabled) => set({ enableTabSleeping: enabled }),

      // ─── Getters ───────────────────────────────────────────────────────────
      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId);
      },

      getTab: (tabId) => {
        return get().tabs.find((t) => t.id === tabId);
      },

      getAwakeTabs: () => {
        return get().tabs.filter((t) => !t.isSleeping);
      },

      getSleepingTabs: () => {
        return get().tabs.filter((t) => t.isSleeping);
      },

      getTotalMemoryUsage: () => {
        return get().tabs.reduce((sum, t) => sum + (t.estimatedMemoryMB || 0), 0);
      },
    }),
    {
      name: 'eduos-browser-tabs',
      partialize: (state) => ({
        // Don't persist runtime state like sleeping - just structure
        tabs: state.tabs.map(t => ({
          ...t,
          isSleeping: false, // Wake all tabs on reload
          sleepingSince: null,
          isLoading: false,
        })),
        activeTabId: state.tabs[0]?.id || null, // Restore to first tab
        sleepTimeout: state.sleepTimeout,
        maxTabs: state.maxTabs,
        enableTabSleeping: state.enableTabSleeping,
      }),
    }
  )
);
