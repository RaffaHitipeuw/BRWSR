// Browser commands for Tauri native WebView
async function invoke(command: string, args?: Record<string, unknown>) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke(command, args);
  } catch {
    return null;
  }
}

export const browser = {
  async navigate(url: string) {
    await invoke("navigate_browser", { url });
  },
  async reload() {
    await invoke("reload_browser");
  },
  async back() {
    await invoke("back_browser");
  },
  async forward() {
    await invoke("forward_browser");
  },
  async minimize() {
    await invoke("minimize_window");
  },
  async toggleMaximize() {
    await invoke("toggle_maximize");
  },
  async close() {
    await invoke("close_window");
  },
};

// Alias for backwards compatibility
export const browserCommands = browser;
