// Tab Layout Manager - Tier 8: Vertical Tiling & Tab Groups
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';

/**
 * Tab Layout Manager
 *
 * Goals:
 * 1. Vertical tab layout option
 * 2. Tab groups with visual hierarchy
 * 3. Detachable tabs (drag to new window)
 * 4. Tab tile/grid view
 */

/**
 * Layout modes
 */
export const LAYOUT_MODE = {
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
  GRID: 'grid',
  DETACHED: 'detached',
};

/**
 * Default groups with colors
 */
export const DEFAULT_GROUPS = [
  { id: 'work', name: 'Work', color: '#4A6FA5', icon: '💼' },
  { id: 'social', name: 'Social', color: '#EC4899', icon: '💬' },
  { id: 'research', name: 'Research', color: '#3F7D58', icon: '🔬' },
  { id: 'entertainment', name: 'Entertainment', color: '#C8932B', icon: '🎬' },
];

const LAYOUT_STORAGE_KEY = 'eduos-tab-layout';

/**
 * Tab Group Manager
 */
const groupManager = {
  groups: [],
  activeGroupId: null,

  /**
   * Initialize groups
   */
  init() {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.groups = data.groups || DEFAULT_GROUPS;
        this.activeGroupId = data.activeGroupId;
      } catch (e) {
        this.groups = DEFAULT_GROUPS;
      }
    } else {
      this.groups = DEFAULT_GROUPS;
    }
    console.log('[Layout] Groups initialized:', this.groups.length);
  },

  /**
   * Save groups to storage
   */
  save() {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
      groups: this.groups,
      activeGroupId: this.activeGroupId,
    }));
  },

  /**
   * Create a new group
   */
  createGroup(name, color, icon = '📁') {
    const id = `group-${Date.now()}`;
    this.groups.push({ id, name, color, icon });
    this.save();
    return id;
  },

  /**
   * Delete a group
   */
  deleteGroup(groupId) {
    this.groups = this.groups.filter(g => g.id !== groupId);
    if (this.activeGroupId === groupId) {
      this.activeGroupId = null;
    }
    this.save();
  },

  /**
   * Rename a group
   */
  renameGroup(groupId, name) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.name = name;
      this.save();
    }
  },

  /**
   * Set group color
   */
  setGroupColor(groupId, color) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.color = color;
      this.save();
    }
  },

  /**
   * Set active group
   */
  setActiveGroup(groupId) {
    this.activeGroupId = groupId;
    this.save();
  },

  /**
   * Get groups
   */
  getGroups() {
    return this.groups;
  },

  /**
   * Get active group
   */
  getActiveGroup() {
    return this.groups.find(g => g.id === this.activeGroupId);
  },
};

// ─── Layout State ─────────────────────────────────────────────────────

const layoutState = {
  mode: LAYOUT_MODE.HORIZONTAL,
  gridColumns: 3,
  gridRows: 2,
  sidebarCollapsed: false,
  sidebarWidth: 240,
  verticalTabWidth: 60,
  showTabTitles: true,

  /**
   * Set layout mode
   */
  setMode(mode) {
    if (Object.values(LAYOUT_MODE).includes(mode)) {
      this.mode = mode;
      console.log(`[Layout] Mode set to: ${mode}`);
    }
  },

  /**
   * Set grid size
   */
  setGridSize(columns, rows) {
    this.gridColumns = Math.max(1, Math.min(6, columns));
    this.gridRows = Math.max(1, Math.min(4, rows));
  },

  /**
   * Toggle sidebar
   */
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  },

  /**
   * Get state
   */
  getState() {
    return { ...this };
  },
};

// ─── Tab Position Manager ─────────────────────────────────────────────

const positionManager = {
  // Track tab positions for grid/vertical layout
  positions: new Map(), // tabId -> { x, y, width, height }

  /**
   * Calculate grid positions
   */
  calculateGridPositions(tabs, columns, rows) {
    const positions = [];
    const totalTabs = tabs.length;
    const cellsPerPage = columns * rows;

    tabs.forEach((tab, index) => {
      const pageIndex = Math.floor(index / cellsPerPage);
      const cellIndex = index % cellsPerPage;

      const col = cellIndex % columns;
      const row = Math.floor(cellIndex / columns);

      positions.push({
        tabId: tab.id,
        pageIndex,
        col,
        row,
        width: `${100 / columns}%`,
        height: `${100 / rows}%`,
      });
    });

    return positions;
  },

  /**
   * Calculate vertical positions
   */
  calculateVerticalPositions(tabs) {
    return tabs.map((tab, index) => ({
      tabId: tab.id,
      index,
      width: 200,
      height: '100%',
    }));
  },

  /**
   * Get positions for current layout
   */
  getPositions(tabs, mode, columns = 3, rows = 2) {
    switch (mode) {
      case LAYOUT_MODE.GRID:
        return this.calculateGridPositions(tabs, columns, rows);
      case LAYOUT_MODE.VERTICAL:
        return this.calculateVerticalPositions(tabs);
      default:
        return tabs.map(tab => ({
          tabId: tab.id,
          width: '100%',
          height: '100%',
        }));
    }
  },
};

// ─── Tab Detach Manager ────────────────────────────────────────────────

const detachManager = {
  // Detached tabs that are in separate windows
  detachedTabs: [],

  /**
   * Detach a tab to new window
   * Note: This creates a reference, actual window creation happens in main process
   */
  detachTab(tabId) {
    const store = useTabStore.getState();
    const tab = store.getTab(tabId);

    if (!tab) return null;

    const detachedTab = {
      ...tab,
      detachedAt: Date.now(),
      windowId: `window-${Date.now()}`,
    };

    this.detachedTabs.push(detachedTab);

    // Remove from main store
    store.removeTab(tabId);

    console.log(`[Layout] Tab detached: ${tab.title}`);

    // Emit event for main process to create window
    window.dispatchEvent(new CustomEvent('tab-detach', {
      detail: detachedTab,
    }));

    return detachedTab;
  },

  /**
   * Attach tab back to main window
   */
  attachTab(tabId) {
    const tab = this.detachedTabs.find(t => t.id === tabId);
    if (!tab) return false;

    const store = useTabStore.getState();
    store.addTab(tab.url);

    this.detachedTabs = this.detachedTabs.filter(t => t.id !== tabId);

    console.log(`[Layout] Tab attached: ${tab.title}`);
    return true;
  },

  /**
   * Get detached tabs
   */
  getDetachedTabs() {
    return this.detachedTabs;
  },

  /**
   * Get detached tab count
   */
  getDetachedCount() {
    return this.detachedTabs.length;
  },
};

// ─── Tab Drag Manager ─────────────────────────────────────────────────

const dragManager = {
  isDragging: false,
  draggedTabId: null,
  dropTargetId: null,

  /**
   * Start drag
   */
  startDrag(tabId) {
    this.isDragging = true;
    this.draggedTabId = tabId;
    console.log(`[Layout] Drag started: ${tabId}`);
  },

  /**
   * Set drop target
   */
  setDropTarget(tabId) {
    this.dropTargetId = tabId;
  },

  /**
   * End drag
   */
  endDrag() {
    if (this.draggedTabId && this.dropTargetId) {
      // Reorder tabs
      const store = useTabStore.getState();
      const tabs = store.tabs;
      const fromIndex = tabs.findIndex(t => t.id === this.draggedTabId);
      const toIndex = tabs.findIndex(t => t.id === this.dropTargetId);

      if (fromIndex !== -1 && toIndex !== -1) {
        store.reorderTabs(fromIndex, toIndex);
      }
    }

    this.isDragging = false;
    this.draggedTabId = null;
    this.dropTargetId = null;
  },

  /**
   * Cancel drag
   */
  cancelDrag() {
    this.isDragging = false;
    this.draggedTabId = null;
    this.dropTargetId = null;
  },

  /**
   * Check if dragging
   */
  isDraggingTab(tabId) {
    return this.draggedTabId === tabId;
  },

  /**
   * Check if drop target
   */
  isDropTarget(tabId) {
    return this.dropTargetId === tabId;
  },
};

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Initialize layout manager
 */
export function initLayoutManager() {
  groupManager.init();
  console.log('[Layout] Manager initialized');
  console.log('[Layout] Mode:', layoutState.mode);
  console.log('[Layout] Groups:', groupManager.groups.length);
}

/**
 * Get layout state
 */
export function getLayoutState() {
  return layoutState.getState();
}

/**
 * Set layout mode
 */
export function setLayoutMode(mode) {
  layoutState.setMode(mode);
}

/**
 * Get groups
 */
export function getGroups() {
  return groupManager.getGroups();
}

/**
 * Create group
 */
export function createGroup(name, color) {
  return groupManager.createGroup(name, color);
}

/**
 * Delete group
 */
export function deleteGroup(groupId) {
  groupManager.deleteGroup(groupId);
}

/**
 * Get tab positions
 */
export function getTabPositions(tabs) {
  return positionManager.getPositions(
    tabs,
    layoutState.mode,
    layoutState.gridColumns,
    layoutState.gridRows
  );
}

/**
 * Detach tab
 */
export function detachTab(tabId) {
  return detachManager.detachTab(tabId);
}

/**
 * Attach tab
 */
export function attachTab(tabId) {
  return detachManager.attachTab(tabId);
}

/**
 * Get drag state
 */
export function getDragState() {
  return {
    isDragging: dragManager.isDragging,
    draggedTabId: dragManager.draggedTabId,
    dropTargetId: dragManager.dropTargetId,
  };
}

// Export managers
export { groupManager, layoutState, positionManager, detachManager, dragManager };
