import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { useNotificationStore } from "../stores/notifications";

interface UpdateInfo {
  available: boolean;
  version: string | null;
  notes: string | null;
}

interface UpdateState {
  checking: boolean;
  updateAvailable: boolean;
  version: string | null;
  notes: string | null;
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    updateAvailable: false,
    version: null,
    notes: null,
    downloading: false,
    downloaded: false,
    error: null,
  });

  const addNotification = useNotificationStore((s) => s.addNotification);

  const checkForUpdates = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true, error: null }));

    try {
      // First try the Rust backend
      const info = await invoke<UpdateInfo>("check_for_updates");

      setState((prev) => ({
        ...prev,
        checking: false,
        updateAvailable: info.available,
        version: info.version,
        notes: info.notes,
      }));

      if (info.available) {
        addNotification({
          type: "info",
          title: "Update Available",
          message: `Version ${info.version} is available`,
          action: {
            label: "Update Now",
            onClick: () => installUpdate(),
          },
        });
      }
    } catch (e) {
      // Fallback to JS API
      try {
        const update = await check();

        if (update) {
          setState((prev) => ({
            ...prev,
            checking: false,
            updateAvailable: true,
            version: update.version,
            notes: update.body || null,
          }));

          addNotification({
            type: "info",
            title: "Update Available",
            message: `Version ${update.version} is available`,
            action: {
              label: "Update Now",
              onClick: () => downloadAndInstall(update),
            },
          });
        } else {
          setState((prev) => ({ ...prev, checking: false }));
        }
      } catch (jsError) {
        setState((prev) => ({
          ...prev,
          checking: false,
          error: String(jsError),
        }));
      }
    }
  }, [addNotification]);

  const downloadAndInstall = useCallback(
    async (update: unknown) => {
      setState((prev) => ({ ...prev, downloading: true, downloaded: false }));

      try {
        const updater = update as {
          downloadAndInstall: (
            onProgress: (progress: {
              event: string;
              data: {
                contentLength?: number;
                chunkLength?: number;
              };
            }) => void,
            onFinished: () => void,
          ) => Promise<void>;
        };

        await updater.downloadAndInstall(
          (progress) => {
            if (progress.event === "Started") {
              console.log(`Download started: ${progress.data.contentLength} bytes`);
            } else if (progress.event === "Progress") {
              console.log(`Downloaded ${progress.data.chunkLength} bytes`);
            } else if (progress.event === "Finished") {
              console.log("Download finished");
            }
          },
          () => {
            console.log("Install complete, restarting...");
          },
        );

        setState((prev) => ({ ...prev, downloading: false, downloaded: true }));

        addNotification({
          type: "success",
          title: "Update Ready",
          message: "Restart the app to apply the update",
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          downloading: false,
          error: String(error),
        }));

        addNotification({
          type: "error",
          title: "Update Failed",
          message: String(error),
        });
      }
    },
    [addNotification],
  );

  const installUpdate = useCallback(async () => {
    setState((prev) => ({ ...prev, downloading: true }));

    try {
      await invoke("install_update");
      // If this succeeds, the app will restart
    } catch (error) {
      setState((prev) => ({
        ...prev,
        downloading: false,
        error: String(error),
      }));

      addNotification({
        type: "error",
        title: "Install Failed",
        message: String(error),
      });
    }
  }, [addNotification]);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    installUpdate,
  };
}

// Get current app version
export async function getAppVersion(): Promise<string> {
  try {
    return await invoke<string>("get_app_version");
  } catch {
    // Fallback for development
    return "0.2.0";
  }
}
