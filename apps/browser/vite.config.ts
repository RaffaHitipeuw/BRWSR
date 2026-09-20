import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1422,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "src/overlay.html"),
        "debug-overlay": resolve(__dirname, "src/debug-overlay.html"),
        "minimal-window": resolve(__dirname, "src/minimal-window.html"),
        ntp: resolve(__dirname, "src/ntp.html"),
        history: resolve(__dirname, "src/history.html"),
        downloads: resolve(__dirname, "src/downloads.html"),
      },
    },
  },
}));
