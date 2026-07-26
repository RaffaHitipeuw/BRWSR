import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',

  // ─── Build Optimization ──────────────────────────────────────────────────
  build: {
    outDir: 'dist',

    // ─── Tier 5: Startup Optimization ────────────────────────────────────

    // Minimize initial bundle size
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
        passes: 2, // Multiple compression passes
      },
      mangle: {
        safari10: true, // Safari 10 compatibility
      },
    },

    // ─── Code Splitting ──────────────────────────────────────────────
    rollupOptions: {
      output: {
        // Better chunk naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        // Force all vendor code into single chunk to prevent React multi-instance
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },

    // ─── CSS Optimization ─────────────────────────────────────────────
    cssCodeSplit: true, // Separate CSS chunks
    cssTarget: 'esnext',

    // ─── Asset Optimization ────────────────────────────────────────────
    assetsInlineLimit: 4096, // Inline assets < 4KB
    chunkSizeWarningLimit: 500,

    // ─── Target & Compatibility ────────────────────────────────────────
    target: 'esnext',
    sourcemap: false,

    // ─── Report Compressed Size ────────────────────────────────────────
    reportCompressedSize: true,
  },

  // ─── Development Server ────────────────────────────────────────────────
  server: {
    port: 3000,
    // Faster HMR
    hmr: {
      overlay: true,
    },
  },

  // ─── Dependency Optimization ─────────────────────────────────────────
  // CRITICAL: Force single React instance
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'zustand',
      'clsx',
    ],
    esbuildOptions: {
      define: {
        __DEV__: 'true',
      },
    },
  },

  // ─── Preview Server ─────────────────────────────────────────────────
  preview: {
    port: 3001,
    cors: true,
  },
});
