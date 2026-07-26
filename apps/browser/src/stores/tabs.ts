import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  history: string[];
  historyIndex: number;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPinned: boolean;
  isMuted: boolean;
  createdAt: number;
  lastAccessedAt: number;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
  isCollapsed: boolean;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  groups: TabGroup[];

  // Memory management
  maxTabs: number;
  memoryUsage: number;

  // Tab actions
  addTab: (url?: string, options?: { groupId?: string; isPinned?: boolean }) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;

  // Navigation actions
  navigate: (id: string, url: string) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  reload: (id: string) => void;

  // Tab management
  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
  muteTab: (id: string) => void;
  unmuteTab: (id: string) => void;
  duplicateTab: (id: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  // Tab groups
  createGroup: (name: string, color: string, tabIds?: string[]) => string;
  deleteGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  addTabToGroup: (tabId: string, groupId: string) => void;
  removeTabFromGroup: (tabId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;

  // Memory management
  enforceMemoryLimits: () => void;
  setMaxTabs: (max: number) => void;

  // State
  getActiveTab: () => Tab | undefined;
  getTabsByGroup: (groupId?: string) => Tab[];
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const DEFAULT_HOME = "https://www.google.com";
const DEFAULT_MAX_TABS = 20;
const MEMORY_LIMIT_PER_TAB_MB = 100;

const createDefaultTab = (url?: string): Tab => {
  const tabUrl = url || DEFAULT_HOME;
  return {
    id: generateId(),
    title: tabUrl.includes("google") ? "Google" : "New Tab",
    url: tabUrl,
    history: [tabUrl],
    historyIndex: 0,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isPinned: false,
    isMuted: false,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };
};

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [createDefaultTab()],
      activeTabId: null,
      groups: [],
      maxTabs: DEFAULT_MAX_TABS,
      memoryUsage: 0,

      addTab: (url?: string, options?: { groupId?: string; isPinned?: boolean }) => {
        const state = get();

        // Enforce memory limits
        if (state.tabs.length >= state.maxTabs) {
          // Close oldest non-pinned tab
          const closableTabs = state.tabs
            .filter((t) => !t.isPinned)
            .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

          if (closableTabs.length > 0) {
            set((s) => ({
              tabs: s.tabs.filter((t) => t.id !== closableTabs[0].id),
            }));
          } else {
            console.warn("Max tabs reached and all tabs are pinned");
            return state.tabs[0].id;
          }
        }

        const id = generateId();
        const newTab: Tab = {
          ...createDefaultTab(url),
          id,
          isPinned: options?.isPinned || false,
        };

        set((state) => {
          let newTabs = [...state.tabs, newTab];

          // If adding to a group, reorder
          if (options?.groupId) {
            const group = state.groups.find((g) => g.id === options.groupId);
            if (group) {
              // Insert after last tab in group or at beginning
              const groupTabs = newTabs.filter((t) => group.tabIds.includes(t.id));
              const lastGroupTab = groupTabs[groupTabs.length - 1];
              const insertIndex = lastGroupTab
                ? newTabs.findIndex((t) => t.id === lastGroupTab.id) + 1
                : 0;
              newTabs = [...newTabs.slice(0, insertIndex), newTab, ...newTabs.slice(insertIndex)];
            }
          }

          return {
            tabs: newTabs,
            activeTabId: id,
            groups: options?.groupId
              ? state.groups.map((g) =>
                  g.id === options.groupId ? { ...g, tabIds: [...g.tabIds, id] } : g,
                )
              : state.groups,
          };
        });

        return id;
      },

      removeTab: (id: string) => {
        set((state) => {
          const tabToRemove = state.tabs.find((t) => t.id === id);
          if (!tabToRemove) return state;

          // Don't remove if it's the only tab and it's pinned
          const pinnedCount = state.tabs.filter((t) => t.isPinned).length;
          if (state.tabs.length === 1 && pinnedCount === 1) {
            return state;
          }

          const newTabs = state.tabs.filter((tab) => tab.id !== id);

          // If no tabs left, create a new one
          if (newTabs.length === 0) {
            return {
              tabs: [createDefaultTab()],
              activeTabId: null,
              groups: state.groups.map((g) => ({
                ...g,
                tabIds: g.tabIds.filter((tid) => tid !== id),
              })),
            };
          }

          // If removing active tab, switch to another
          let newActiveTabId = state.activeTabId;
          if (state.activeTabId === id) {
            const removedIndex = state.tabs.findIndex((tab) => tab.id === id);
            newActiveTabId =
              newTabs[Math.min(removedIndex, newTabs.length - 1)]?.id || newTabs[0].id;
          }

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
            groups: state.groups.map((g) => ({
              ...g,
              tabIds: g.tabIds.filter((tid) => tid !== id),
            })),
          };
        });
      },

      setActiveTab: (id: string) => {
        set((state) => ({
          activeTabId: id,
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, lastAccessedAt: Date.now() } : tab,
          ),
        }));
      },

      updateTab: (id: string, updates: Partial<Tab>) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, ...updates, lastAccessedAt: Date.now() } : tab,
          ),
        }));
      },

      navigate: (id: string, url: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== id) return tab;

            // Extract title from URL
            let title = tab.title;
            if (title === "New Tab" || title === "Loading...") {
              try {
                const urlObj = new URL(url);
                title = urlObj.hostname;
              } catch {
                title = url;
              }
            }

            // Truncate forward history when navigating to new page
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
            };
          }),
        }));
      },

      goBack: (id: string) => {
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

      goForward: (id: string) => {
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

      reload: (id: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isLoading: true } : tab)),
        }));
      },

      pinTab: (id: string) => {
        set((state) => {
          const tab = state.tabs.find((t) => t.id === id);
          if (!tab) return state;

          // Move pinned tab to the beginning
          const newTabs = state.tabs.filter((t) => t.id !== id);
          const pinnedIndex = newTabs.findIndex((t) => !t.isPinned);
          if (pinnedIndex === -1) {
            newTabs.push({ ...tab, isPinned: true });
          } else {
            newTabs.splice(pinnedIndex, 0, { ...tab, isPinned: true });
          }

          return { tabs: newTabs };
        });
      },

      unpinTab: (id: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isPinned: false } : tab)),
        }));
      },

      muteTab: (id: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isMuted: true } : tab)),
        }));
      },

      unmuteTab: (id: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, isMuted: false } : tab)),
        }));
      },

      duplicateTab: (id: string) => {
        const state = get();
        const tab = state.tabs.find((t) => t.id === id);
        if (!tab) return;

        state.addTab(tab.url, { isPinned: false });
      },

      closeAllTabs: () => {
        set((state) => {
          // Keep pinned tabs
          const pinnedTabs = state.tabs.filter((t) => t.isPinned);
          const newActiveTab = pinnedTabs[0] || createDefaultTab();

          return {
            tabs: pinnedTabs.length > 0 ? [newActiveTab] : [createDefaultTab()],
            activeTabId: pinnedTabs.length > 0 ? pinnedTabs[0].id : newActiveTab.id,
          };
        });
      },

      closeOtherTabs: (id: string) => {
        set((state) => {
          const tab = state.tabs.find((t) => t.id === id);
          if (!tab) return state;

          return {
            tabs: state.tabs.filter((t) => t.id === id || t.isPinned),
            activeTabId: id,
          };
        });
      },

      reorderTabs: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const newTabs = [...state.tabs];
          const [removed] = newTabs.splice(fromIndex, 1);
          newTabs.splice(toIndex, 0, removed);
          return { tabs: newTabs };
        });
      },

      createGroup: (name: string, color: string, tabIds?: string[]) => {
        const id = generateId();
        const group: TabGroup = {
          id,
          name,
          color,
          tabIds: tabIds || [],
          isCollapsed: false,
        };

        set((state) => ({
          groups: [...state.groups, group],
        }));

        return id;
      },

      deleteGroup: (groupId: string) => {
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== groupId),
        }));
      },

      renameGroup: (groupId: string, name: string) => {
        set((state) => ({
          groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
        }));
      },

      addTabToGroup: (tabId: string, groupId: string) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId && !g.tabIds.includes(tabId)
              ? { ...g, tabIds: [...g.tabIds, tabId] }
              : g,
          ),
        }));
      },

      removeTabFromGroup: (tabId: string) => {
        set((state) => ({
          groups: state.groups.map((g) => ({
            ...g,
            tabIds: g.tabIds.filter((id) => id !== tabId),
          })),
        }));
      },

      toggleGroupCollapse: (groupId: string) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g,
          ),
        }));
      },

      enforceMemoryLimits: () => {
        set((state) => {
          const currentUsage = state.tabs.length * MEMORY_LIMIT_PER_TAB_MB;

          // Auto-close oldest non-pinned tabs if over memory
          let tabsToKeep = state.tabs;
          while (
            tabsToKeep.length > 1 &&
            tabsToKeep.length * MEMORY_LIMIT_PER_TAB_MB > state.maxTabs * MEMORY_LIMIT_PER_TAB_MB
          ) {
            const oldestNonPinned = tabsToKeep
              .filter((t) => !t.isPinned)
              .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

            if (oldestNonPinned.length === 0) break;

            tabsToKeep = tabsToKeep.filter((t) => t.id !== oldestNonPinned[0].id);
          }

          return {
            tabs: tabsToKeep,
            memoryUsage: currentUsage,
            activeTabId:
              state.activeTabId && tabsToKeep.some((t) => t.id === state.activeTabId)
                ? state.activeTabId
                : tabsToKeep[0]?.id || null,
          };
        });
      },

      setMaxTabs: (max: number) => {
        set({ maxTabs: max });
        get().enforceMemoryLimits();
      },

      getActiveTab: () => {
        const state = get();
        return state.tabs.find((tab) => tab.id === state.activeTabId);
      },

      getTabsByGroup: (groupId?: string) => {
        const state = get();
        if (!groupId) return state.tabs;

        const group = state.groups.find((g) => g.id === groupId);
        if (!group) return [];

        return state.tabs.filter((t) => group.tabIds.includes(t.id));
      },
    }),
    {
      name: "eduos-browser-tabs",
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        groups: state.groups,
        maxTabs: state.maxTabs,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.activeTabId && state.tabs.length > 0) {
            state.activeTabId = state.tabs[0].id;
          }
          state.enforceMemoryLimits();
        }
      },
    },
  ),
);

// Initialize activeTabId on first load
const initializeActiveTab = () => {
  const state = useTabStore.getState();
  if (!state.activeTabId && state.tabs.length > 0) {
    useTabStore.setState({ activeTabId: state.tabs[0].id });
  }
};

initializeActiveTab();
