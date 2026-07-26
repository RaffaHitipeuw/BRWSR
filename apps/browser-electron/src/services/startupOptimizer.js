// Startup Optimizer Service - Tier 5: Startup Optimization
// Backend only - no UI changes

/**
 * Startup Optimizer
 *
 * Goals:
 * 1. First Contentful Paint (FCP) < 500ms
 * 2. Time to Interactive (TTI) < 1.5s
 * 3. Bundle size < 200KB gzipped
 */

/**
 * Critical CSS Inlining
 * Extracts and inlines critical CSS for faster FCP
 */
export function inlineCriticalCSS() {
  if (typeof document === 'undefined') return;

  // Critical CSS for instant render
  const criticalCSS = `
    /* Critical path CSS - inlined for instant render */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #1a1a1a;
      color: #fff;
      -webkit-font-smoothing: antialiased;
    }
    /* Prevent FOUC */
    #root { opacity: 1; }
    /* Loading state */
    .app-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      background: #1a1a1a;
    }
    .app-loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top-color: #C8932B;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); }
  `;

  // Check if already injected
  const existing = document.getElementById('critical-css');
  if (existing) return;

  // Inject critical CSS
  const style = document.createElement('style');
  style.id = 'critical-css';
  style.textContent = criticalCSS;
  document.head.appendChild(style);

  console.log('[Startup] Critical CSS inlined');
}

/**
 * Pre-render shell for instant FCP
 */
export function renderLoadingShell() {
  if (typeof document === 'undefined') return;

  const root = document.getElementById('root');
  if (!root || root.children.length > 0) return;

  // Render minimal loading shell immediately
  root.innerHTML = `
    <div class="app-loading">
      <div class="app-loading-spinner"></div>
    </div>
  `;

  console.log('[Startup] Loading shell rendered');
}

/**
 * Performance observer for measuring startup metrics
 */
export function observeStartupMetrics(callback) {
  if (typeof window === 'undefined') return;

  const metrics = {
    fcp: null,
    lcp: null,
    tti: null,
    tbt: null,
  };

  // Performance Observer API
  if ('PerformanceObserver' in window) {
    // FCP
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            metrics.fcp = entry.startTime;
            console.log(`[Startup] FCP: ${Math.round(entry.startTime)}ms`);
          }
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch (e) {}

    // LCP
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        metrics.lcp = lastEntry.startTime;
        console.log(`[Startup] LCP: ${Math.round(lastEntry.startTime)}ms`);
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}

    // TBT
    try {
      const tbtObserver = new PerformanceObserver((list) => {
        let total = 0;
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            total += entry.duration - 50;
          }
        }
        metrics.tbt = total;
        console.log(`[Startup] TBT: ${Math.round(total)}ms`);
      });
      tbtObserver.observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  }

  // Calculate TTI when app is ready
  const checkTTI = setInterval(() => {
    if (document.readyState === 'complete') {
      // Simple TTI approximation
      metrics.tti = performance.now();
      console.log(`[Startup] TTI: ${Math.round(metrics.tti)}ms`);

      clearInterval(checkTTI);
      if (callback) callback(metrics);
    }
  }, 100);

  return metrics;
}

/**
 * Get startup performance score (0-100)
 */
export function getStartupScore() {
  const timing = performance?.timing;
  if (!timing) return null;

  const navigationStart = timing.navigationStart;
  const domContentLoaded = timing.domContentLoadedEventEnd - navigationStart;
  const loadComplete = timing.loadEventEnd - navigationStart;

  // Score based on thresholds
  // FCP target: <500ms = 100
  // DCL target: <1000ms = 100
  // Load target: <2000ms = 100

  const dclScore = Math.max(0, 100 - (domContentLoaded - 1000) / 20);
  const loadScore = Math.max(0, 100 - (loadComplete - 2000) / 30);
  const overallScore = Math.round((dclScore + loadScore) / 2);

  return {
    domContentLoaded: Math.round(domContentLoaded),
    loadComplete: Math.round(loadComplete),
    score: overallScore,
    grade: overallScore >= 90 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 50 ? 'C' : 'D',
  };
}

/**
 * Lazy load non-critical resources
 */
export function lazyLoadResources() {
  if (typeof document === 'undefined') return;

  // Defer non-critical CSS
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
  stylesheets.forEach((link) => {
    if (link.media === 'print') return; // Skip print styles

    // Mark as lazy loaded
    link.setAttribute('media', 'lazy');
    link.setAttribute('onload', "this.media='all'");
  });

  // Defer non-critical scripts
  const scripts = document.querySelectorAll('script[defer]');
  scripts.forEach((script) => {
    // Re-append with defer
    const parent = script.parentNode;
    parent.removeChild(script);
    parent.appendChild(script);
  });

  console.log('[Startup] Non-critical resources marked for lazy load');
}

/**
 * Preconnect to critical origins
 */
export function preconnectCriticalOrigins() {
  if (typeof document === 'undefined') return;

  const criticalOrigins = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ];

  criticalOrigins.forEach((origin) => {
    // Preconnect
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = origin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
  });

  console.log('[Startup] Critical origins preconnected');
}

/**
 * Initialize startup optimizations
 */
export function initStartupOptimizer() {
  // 1. Inline critical CSS immediately
  inlineCriticalCSS();

  // 2. Render loading shell (no flash)
  renderLoadingShell();

  // 3. Preconnect to critical origins
  preconnectCriticalOrigins();

  // 4. Observe metrics
  observeStartupMetrics((metrics) => {
    const score = getStartupScore();
    console.log('[Startup] Performance Score:', score);
  });

  // 5. Lazy load non-critical resources after FCP
  if (document.readyState === 'complete') {
    lazyLoadResources();
  } else {
    window.addEventListener('load', lazyLoadResources);
  }

  console.log('[Startup] Optimizer initialized');
}
