import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initResourceHints, precacheModules } from './utils/lazyLoad.jsx';
import { initGPUAcceleration } from './utils/gpu';
import {
  initHttp3,
  getHttp3Stats,
} from './services/http3';
import {
  initSessionRestore,
  startAutoSnapshot,
} from './services/sessionRestore';
import {
  setupCompressorIntegration,
  startAutoCompress,
} from './services/tabCompressor';
import {
  initStartupOptimizer,
  getStartupScore,
} from './services/startupOptimizer';
import {
  initProcessIsolation,
  isolationManager,
} from './services/processIsolation';
import {
  initCpuScheduler,
  cpuScheduler,
  PRIORITY,
} from './services/cpuScheduler';
import {
  initLayoutManager,
  getLayoutState,
  LAYOUT_MODE,
} from './services/tabLayout';
import {
  initPredictiveLoader,
  getPredictionStats,
} from './services/predictiveLoader';
import {
  initPerformanceDashboard,
  getPerformanceScore,
  getDashboardData,
} from './services/performanceDashboard.jsx';

// ─── Initialize All Performance Optimizations ────────────────────────────────

// 1. Resource hints (preload, preconnect)
initResourceHints();

// 2. GPU acceleration CSS
initGPUAcceleration();

// 3. HTTP/3 connection pooling
initHttp3();

// 4. Session restore with lazy loading
initSessionRestore();

// 5. Tab compressor integration (Tier 4: Memory Compression)
setupCompressorIntegration();
startAutoCompress();

// 6. Startup optimizer (Tier 5: Startup Optimization)
initStartupOptimizer();

// 7. Process isolation (Tier 6: Crash Safety)
initProcessIsolation();

// 8. CPU Scheduler (Tier 7: Per-Tab CPU Priority)
// initCpuScheduler(); // Disabled - debugging

// 9. Tab Layout Manager (Tier 8: Vertical Tiling)
initLayoutManager();

// 10. Predictive Loader (Tier 9: AI Prediction)
initPredictiveLoader();

// 11. Performance Dashboard (Tier 10: Real-time Monitoring)
initPerformanceDashboard();

// 12. Precache critical modules in background
precacheModules();

// ─── Performance Monitoring ────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'development') {
  console.log('[Perf] HTTP/3 Stats:', getHttp3Stats());

  // Check GPU availability
  import('./utils/gpu').then(({ getGPUInfo }) => {
    console.log('[Perf] GPU Info:', getGPUInfo());
  });
}

// ─── DevTools Performance Panel ─────────────────────────────────────────────

if (process.env.NODE_ENV === 'development') {
  // Expose performance APIs to window for debugging
  window.__EDUOS_PERF__ = {
    // Core
    http3: () => getHttp3Stats(),
    gpu: () => import('./utils/gpu').then(m => m.getGPUInfo()),
    startup: () => getStartupScore(),

    // Tier 1-3
    session: () => import('./services/sessionRestore').then(m => ({
      analytics: m.getSessionAnalytics(),
      progress: m.getRestoreProgress(),
    })),
    isolation: () => isolationManager.getCrashStats(),
    cpu: () => cpuScheduler.getStats(),
    priority: PRIORITY,

    // Tier 8
    layout: () => getLayoutState(),
    layoutMode: LAYOUT_MODE,

    // Tier 9
    predict: () => getPredictionStats(),
    predictions: () => import('./services/predictiveLoader').then(m => m.predictNextTabs(window.location.href)),

    // Tier 10
    score: () => getPerformanceScore(),
    dashboard: () => getDashboardData(),
  };

  // Log startup score
  const startupScore = getStartupScore();
  if (startupScore) {
    console.log(`[Startup] Score: ${startupScore.score}/100 (Grade: ${startupScore.grade})`);
    console.log(`[Startup] DCL: ${startupScore.domContentLoaded}ms | Load: ${startupScore.loadComplete}ms`);
  }

  // Log CPU stats
  console.log('[CPU] Scheduler initialized, stats:', cpuScheduler.getStats());

  // Log performance score
  const perfScore = getPerformanceScore();
  console.log(`[Perf] Overall Score: ${perfScore.overall}/100 (${perfScore.grade})`);
  console.log('[Perf] Breakdown:', perfScore.breakdown);

  console.log('[Dev] Performance APIs available at window.__EDUOS_PERF__');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
