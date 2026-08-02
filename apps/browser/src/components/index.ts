export { TabBar } from "./TabBar";
export { NavigationBar } from "./NavigationBar";
export { Sidebar, SidebarSection, DEFAULT_SIDEBAR_ITEMS, SETTINGS_SIDEBAR_ITEMS } from "./Sidebar";
export type { SidebarItem } from "./Sidebar";
export { ToastContainer, NotificationCenter, NotificationBell } from "./Notifications";
export { AppLauncher, EDUOS_APPS } from "./AppLauncher";
export type { App } from "./AppLauncher";
export { browser, browserCommands } from "./browserCommands";

// Re-export stores for convenience
export { useTabStore } from "../stores/tabs";
export type { Tab, TabGroup } from "../stores/tabs";
export { useNotificationStore, notify } from "../stores/notifications";
export type { Notification, NotificationType } from "../stores/notifications";

// Re-export hooks
export { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
