
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { browser } from "../components/browserCommands";
import { useMemoryManager } from "./memoryManager";
import type { Tab, TabGroup, TabLifecycleState, TabPriority } from "./types";

export type { Tab, TabGroup, TabLifecycleState, TabPriority };

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      groups: [],
      maxTabs: 10,

      setTabs: (tabs) => {
        set({ tabs, activeTabId: tabs[0]?.id || null });
      },

      addTab: (url, options) => {
        const state = get();

        const memory_manager = useMemoryManager.getState();
        const can_add = memory_manager.canRestoreTab("new");
        if (!can_add) {
          console.warn("Memory budget exceeded, cannot add tab");
          return state.tabs[0]?.id;
        }

        const id = Math.random().toString(36).substring(2, 9);
        const newTab: Tab = {
          id,
          title: "New Tab",
          url: url || "https://www.google.com",
          history: [url || "https://www.google.com"],
          historyIndex: 0,
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          isPinned: options?.isPinned || false,
          isMuted: false,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          estimated_memory_mb: 50,
          lifecycle_state: "restoring",
        };

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id,
        }));

        memory_manager.updateTabHint(id, {
          tab_id: id,
          estimated_memory_mb: 50,
          last_accessed: Date.now(),
          priority: "active",
        });

        return id;
      },

      removeTab: (id) => {
        const state = get();
        const tabToRemove = state.tabs.find((t) => t.id === id);
        if (!tabToRemove) return;

        if (tabToRemove.lifecycle_state === "evicted") {
          useMemoryManager.getState().removeTabHint(id);
        }

        closedTabs.push({ ...tabToRemove, lastAccessedAt: Date.now() });
        if (closedTabs.length > 20) {
          closedTabs = closedTabs.slice(-20);
        }

        const newTabs = state.tabs.filter((tab) => tab.id !== id);

        if (newTabs.length === 0) {
          return;
        }

        let newActiveTabId = state.activeTabId;
        if (state.activeTabId === id) {
          const removedIndex = state.tabs.findIndex((tab) => tab.id === id);
          newActiveTabId = newTabs[Math.min(removedIndex, newTabs.length - 1)]?.id;
        }

        set({
          tabs: newTabs,
          activeTabId: newActiveTabId,
          groups: state.groups.map((g) => ({
            ...g,
            tabIds: g.tabIds.filter((tid) => tid !== id),
          })),
        });
      },

      setActiveTab: (id) => {
        set((state) => ({
          activeTabId: id,
          tabs: state.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  lastAccessedAt: Date.now(),
                  lifecycle_state: "active" as TabLifecycleState,
                }
              : tab,
          ),
        }));

        useMemoryManager.getState().updateTabHint(id, {
          priority: "active",
          last_accessed: Date.now(),
        });
      },

      updateTab: (id, updates) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, ...updates, lastAccessedAt: Date.now() } : tab,
          ),
        }));
      },

      suspendTab: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return;

        if (tab.lifecycle_state !== "visible" && tab.lifecycle_state !== "active") {
          return;
        }

        browser.evictTab(id).catch(console.error);

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id
              ? { ...t, lifecycle_state: "evicting" as TabLifecycleState, estimated_memory_mb: 0 }
              : t,
          ),
        }));

        useMemoryManager.getState().updateTabHint(id, { priority: "idle" });
      },

      evictTab: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return;

        browser.evictTab(id).catch(console.error);

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id
              ? { ...t, lifecycle_state: "evicted" as TabLifecycleState, estimated_memory_mb: 0 }
              : t,
          ),
        }));

        useMemoryManager.getState().removeTabHint(id);
      },

      restoreTabFromEvicted: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab || tab.lifecycle_state !== "evicted") return;

        const memory_manager = useMemoryManager.getState();
        if (!memory_manager.canRestoreTab(id)) {
          console.warn("Cannot restore tab - memory budget exceeded");
          return;
        }

        browser.restoreTab(id).catch(console.error);

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id
              ? { ...t, lifecycle_state: "restoring" as TabLifecycleState, estimated_memory_mb: 50 }
              : t,
          ),
        }));

        memory_manager.updateTabHint(id, {
          tab_id: id,
          estimated_memory_mb: 50,
          last_accessed: Date.now(),
          priority: "recent",
        });
      },

      setTabPriority: (id, priority) => {
        useMemoryManager.getState().updateTabHint(id, { priority });
      },

      navigate: (id, url) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== id) return tab;

            let title = tab.title;
            if (title === "New Tab" || title === "Loading...") {
              try {
                title = new URL(url).hostname;
              } catch {
                title = url;
              }
            }

            const newHistory = [...tab.history.slice(0, tab.historyIndex + 1), url];

            return {
              ...tab,
              title,
              url,
              history: newHistory,
              historyIndex: newHistory.length - 1,
              canGoBack: newHistory.length > 1,
              canGoForward: false,
              isLoading: true,
              lastAccessedAt: Date.now(),
              lifecycle_state: "visible" as TabLifecycleState,
            };
          }),
        }));

        useMemoryManager.getState().updateTabHint(id, {
          priority: "active",
          last_accessed: Date.now(),
        });
      },

      goBack: (id) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== id || tab.historyIndex <= 0) return tab;
            const newIndex = tab.historyIndex - 1;
            return {
              ...tab,
              url: tab.history[newIndex],
              historyIndex: newIndex,
              canGoBack: newIndex > 0,
              canGoForward: true,
              isLoading: true,
              lastAccessedAt: Date.now(),
            };
          }),
        }));
      },

      goForward: (id) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== id || tab.historyIndex >= tab.history.length - 1) return tab;
            const newIndex = tab.historyIndex + 1;
            return {
              ...tab,
              url: tab.history[newIndex],
              historyIndex: newIndex,
              canGoBack: true,
              canGoForward: newIndex < tab.history.length - 1,
              isLoading: true,
              lastAccessedAt: Date.now(),
            };
          }),
        }));
      },

      reload: (id) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isLoading: true } : tab)),
        }));
      },

      pinTab: (id) => {
        set((state) => {
          const tab = state.tabs.find((t) => t.id === id);
          if (!tab) return state;

          const newTabs = state.tabs.filter((t) => t.id !== id);
          const pinnedIndex = newTabs.findIndex((t) => !t.isPinned);
          if (pinnedIndex === -1) {
            newTabs.push({ ...tab, isPinned: true });
          } else {
            newTabs.splice(pinnedIndex, 0, { ...tab, isPinned: true });
          }

          return { tabs: newTabs };
        });

        useMemoryManager.getState().updateTabHint(id, { priority: "pinned" });
      },

      unpinTab: (id) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isPinned: false } : tab)),
        }));
      },

      muteTab: (id) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isMuted: true } : tab)),
        }));
      },

      unmuteTab: (id) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isMuted: false } : tab)),
        }));
      },

      duplicateTab: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return;
        get().addTab(tab.url, { isPinned: false });
      },

      closeAllTabs: () => {
        set((state) => {
          const pinnedTabs = state.tabs.filter((t) => t.isPinned);
          const newTab = {
            id: Math.random().toString(36).substring(2, 9),
            title: "New Tab",
            url: "https://www.google.com",
            history: ["https://www.google.com"],
            historyIndex: 0,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            isPinned: false,
            isMuted: false,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            estimated_memory_mb: 50,
            lifecycle_state: "active" as TabLifecycleState,
          };

          return {
            tabs: pinnedTabs.length > 0 ? [newTab] : [newTab],
            activeTabId: newTab.id,
          };
        });
      },

      closeOtherTabs: (id) => {
        set((state) => ({
          tabs: state.tabs.filter((t) => t.id === id || t.isPinned),
          activeTabId: id,
        }));
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((state) => {
          const newTabs = [...state.tabs];
          const [removed] = newTabs.splice(fromIndex, 1);
          newTabs.splice(toIndex, 0, removed);
          return { tabs: newTabs };
        });
      },

      createGroup: (name, color, tabIds = []) => {
        const id = Math.random().toString(36).substring(2, 9);
        const group: TabGroup = { id, name, color, tabIds, isCollapsed: false };
        set((state) => ({ groups: [...state.groups, group] }));
        return id;
      },

      deleteGroup: (groupId) => {
        set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) }));
      },

      renameGroup: (groupId, name) => {
        set((state) => ({
          groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
        }));
      },

      addTabToGroup: (tabId, groupId) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId && !g.tabIds.includes(tabId)
              ? { ...g, tabIds: [...g.tabIds, tabId] }
              : g,
          ),
        }));
      },

      removeTabFromGroup: (tabId) => {
        set((state) => ({
          groups: state.groups.map((g) => ({
            ...g,
            tabIds: g.tabIds.filter((id) => id !== tabId),
          })),
        }));
      },

      toggleGroupCollapse: (groupId) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g,
          ),
        }));
      },

      enforceMemoryLimits: () => {
        const state = get();
        const memory_manager = useMemoryManager.getState();
        const { observed } = memory_manager;

        if (!observed) return;

        const tabs_to_evict = memory_manager.getTabsToEvict();

        tabs_to_evict.forEach((tab_id) => {
          if (!state.tabs.find((t) => t.id === tab_id)?.isPinned) {
            get().evictTab(tab_id);
          }
        });
      },

      setMaxTabs: (max) => {
        set({ maxTabs: max });
        useMemoryManager.getState().setMaxTabs(max);
        get().enforceMemoryLimits();
      },

      restoreTab: () => {
        if (closedTabs.length === 0) return null;
        const tab = closedTabs.pop()!;
        const id = Math.random().toString(36).substring(2, 9);
        const restoredTab = {
          ...tab,
          id,
          isLoading: false,
          lifecycle_state: "restoring" as TabLifecycleState,
        };

        const memory_manager = useMemoryManager.getState();
        if (!memory_manager.canRestoreTab(id)) {
          console.warn("Cannot restore - memory budget exceeded");
          closedTabs.push(tab);
          return null;
        }

        set((state) => ({
          tabs: [...state.tabs, restoredTab],
          activeTabId: id,
        }));

        memory_manager.updateTabHint(id, {
          tab_id: id,
          estimated_memory_mb: tab.estimated_memory_mb || 50,
          last_accessed: Date.now(),
          priority: "recent",
        });

        return restoredTab;
      },

      getClosedTabs: () => [...closedTabs],

      getActiveTab: () => {
        const state = get();
        return state.tabs.find((tab) => tab.id === state.activeTabId);
      },

      getTabsByGroup: (groupId) => {
        const state = get();
        if (!groupId) return state.tabs;
        const group = state.groups.find((g) => g.id === groupId);
        if (!group) return [];
        return state.tabs.filter((t) => group.tabIds.includes(t.id));
      },

      getTabsByLifecycle: (lifecycleState) => {
        return get().tabs.filter((t) => t.lifecycle_state === lifecycleState);
      },
    }),
    {
      name: "eduos-browser-tabs",
      partialize: (state) => ({
        tabs: state.tabs
          .filter((t) => t.isPinned)
          .map((t) => ({
            ...t,
            lifecycle_state: "evicted",
            estimated_memory_mb: 0,
          })),
        activeTabId: state.tabs.find((t) => t.isPinned)?.id || null,
        groups: state.groups,
        maxTabs: state.maxTabs,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const newTab = {
            id: Math.random().toString(36).substring(2, 9),
            title: "New Tab",
            url: "https://www.google.com",
            history: ["https://www.google.com"],
            historyIndex: 0,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            isPinned: false,
            isMuted: false,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            estimated_memory_mb: 50,
            lifecycle_state: "active" as TabLifecycleState,
          };
          state.tabs = [newTab];
          state.activeTabId = newTab.id;
          state.enforceMemoryLimits();
        }
      },
    },
  ),
);

let closedTabs: Tab[] = [];

export interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  groups: TabGroup[];
  maxTabs: number;

  setTabs: (tabs: Tab[]) => void;
  addTab: (url?: string, options?: { groupId?: string; isPinned?: boolean }) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;

  suspendTab: (id: string) => void;
  evictTab: (id: string) => void;
  restoreTabFromEvicted: (id: string) => void;

  setTabPriority: (id: string, priority: TabPriority) => void;

  navigate: (id: string, url: string) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  reload: (id: string) => void;

  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
  muteTab: (id: string) => void;
  unmuteTab: (id: string) => void;
  duplicateTab: (id: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  createGroup: (name: string, color: string, tabIds?: string[]) => string;
  deleteGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  addTabToGroup: (tabId: string, groupId: string) => void;
  removeTabFromGroup: (tabId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;

  enforceMemoryLimits: () => void;
  setMaxTabs: (max: number) => void;

  restoreTab: () => Tab | null;
  getClosedTabs: () => Tab[];

  getActiveTab: () => Tab | undefined;
  getTabsByGroup: (groupId?: string) => Tab[];
  getTabsByLifecycle: (state: TabLifecycleState) => Tab[];
}
