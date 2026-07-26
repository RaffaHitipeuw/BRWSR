export { TabBar } from "./TabBar";
export { NavigationBar } from "./NavigationBar";
export { useBrowserShortcuts } from "./BrowserManager";
export { browser, browserCommands } from "./browserCommands";
export { Sidebar, SidebarSection, DEFAULT_SIDEBAR_ITEMS, SETTINGS_SIDEBAR_ITEMS } from "./Sidebar";
export type { SidebarItem } from "./Sidebar";
export { ToastContainer, NotificationCenter, NotificationBell } from "./Notifications";
export { AppLauncher, EDUOS_APPS } from "./AppLauncher";
export type { App } from "./AppLauncher";

// Re-export stores for convenience
export { useTabStore } from "../stores/tabs";
export type { Tab, TabGroup } from "../stores/tabs";
export { useNotificationStore, notify } from "../stores/notifications";
export type { Notification, NotificationType } from "../stores/notifications";
