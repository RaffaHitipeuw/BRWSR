// Lazy Loading Utilities - Component & Route Splitting
// Backend only - no UI changes

import { lazy, Suspense } from 'react';

/**
 * Lazy load a component with loading fallback
 * Usage: const MyComponent = lazyLoad(() => import('./MyComponent'))
 */
export function lazyLoad(importFn, LoadingComponent = null) {
  const LazyComponent = lazy(importFn);

  return function LazyLoadedComponent(props) {
    return (
      <Suspense fallback={LoadingComponent || <DefaultLoading />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * Default loading spinner
 */
function DefaultLoading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        backgroundColor: '#1a1a1a',
        color: '#666',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid #333',
          borderTopColor: '#C8932B',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

/**
 * Preload a component (for faster navigation)
 * Usage: preloadComponent(() => import('./HeavyComponent'))
 */
export function preloadComponent(importFn) {
  importFn().catch(() => {
    // Silent fail - preloading is best-effort
  });
}

/**
 * Preload multiple components
 */
export function preloadComponents(importFns) {
  importFns.forEach(preloadComponent);
}

// ─── Dynamic Import Utilities ─────────────────────────────────────────────────

/**
 * Dynamically import a module (for code splitting)
 * Note: Browser-electron doesn't have page routes - it's a single-page browser app
 */
export async function dynamicImport(modulePath) {
  try {
    return await import(/* @vite-ignore */ modulePath);
  } catch (error) {
    console.error(`Failed to dynamically import: ${modulePath}`, error);
    return null;
  }
}

/**
 * Precache critical modules on app load
 * Note: For browser-electron, we don't need heavy module preloading
 * since it's a single-page app
 */
export async function precacheModules() {
  // No-op for browser-electron
  // The app is lightweight and doesn't have route-based code splitting
  console.log('[LazyLoad] Module precaching skipped (single-page app)');
}

// ─── Resource Hints ─────────────────────────────────────────────────────────

/**
 * Add resource hints (preload, prefetch, preconnect)
 */
export function addResourceHint(type, href, options = {}) {
  if (typeof document === 'undefined') return;

  const existing = document.querySelector(`link[href="${href}"]`);
  if (existing) return;

  const link = document.createElement('link');
  link.rel = type;
  link.href = href;

  if (options.as) link.as = options.as;
  if (options.crossOrigin) link.crossOrigin = options.crossOrigin;
  if (options.type) link.type = options.type;

  document.head.appendChild(link);
}

/**
 * Preload a resource
 */
export function preloadResource(href, options = {}) {
  addResourceHint('preload', href, options);
}

/**
 * Prefetch a resource (lower priority than preload)
 */
export function prefetchResource(href, options = {}) {
  addResourceHint('prefetch', href, options);
}

/**
 * Preconnect to a domain
 */
export function preconnectDomain(href, options = {}) {
  addResourceHint('preconnect', href, options);
}

/**
 * Initialize resource hints for browser app
 */
export function initResourceHints() {
  // Google Fonts
  preconnectDomain('https://fonts.googleapis.com');
  preconnectDomain('https://fonts.gstatic.com', { crossOrigin: true });

  // Common origins for faster connections
  preconnectDomain('https://www.google.com');

  // Preload critical JS
  preloadResource('/src/main.jsx', { as: 'script' });

  console.log('[LazyLoad] Resource hints initialized');
}
