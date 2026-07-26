import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// EduOS dashboard dev server.
// Fixed port 5173 because apps/browser (Tauri shell) points its devUrl here.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@eduos/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
