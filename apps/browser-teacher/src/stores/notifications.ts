import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  createdAt: number;
  read: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  settings: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    maxVisible: number;
    defaultDuration: number;
  };

  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "read">) => string;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;

  updateSettings: (settings: Partial<NotificationStore["settings"]>) => void;

  setIsOpen: (isOpen: boolean) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      isOpen: false,
      settings: {
        enabled: true,
        sound: true,
        desktop: false,
        maxVisible: 5,
        defaultDuration: 5000,
      },

      addNotification: (notification) => {
        const id = generateId();
        const newNotification: Notification = {
          ...notification,
          id,
          createdAt: Date.now(),
          read: false,
        };

        set((state) => {
          const notifications = [newNotification, ...state.notifications].slice(
            0,
            state.settings.maxVisible * 2,
          );

          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });

        if (notification.duration !== 0) {
          const duration = notification.duration || get().settings.defaultDuration;
          setTimeout(() => {
            get().removeNotification(id);
          }, duration);
        }

        if (get().settings.desktop && "Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification(notification.title, {
              body: notification.message,
              icon: "/icons/128x128.png",
            });
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((permission) => {
              if (permission === "granted") {
                new Notification(notification.title, {
                  body: notification.message,
                  icon: "/icons/128x128.png",
                });
              }
            });
          }
        }

        return id;
      },

      removeNotification: (id) => {
        set((state) => {
          const notifications = state.notifications.filter((n) => n.id !== id);
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
      },

      markAsRead: (id) => {
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          );
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      clearAll: () => {
        set({ notifications: [], unreadCount: 0 });
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      setIsOpen: (isOpen) => {
        set({ isOpen });
      },
    }),
    {
      name: "eduos-notifications",
      partialize: (state) => ({
        notifications: state.notifications,
        settings: state.settings,
      }),
    },
  ),
);

export const notify = {
  info: (title: string, message?: string) => {
    useNotificationStore.getState().addNotification({ type: "info", title, message });
  },
  success: (title: string, message?: string) => {
    useNotificationStore.getState().addNotification({ type: "success", title, message });
  },
  warning: (title: string, message?: string) => {
    useNotificationStore.getState().addNotification({ type: "warning", title, message });
  },
  error: (title: string, message?: string) => {
    useNotificationStore.getState().addNotification({ type: "error", title, message, duration: 0 });
  },
};
