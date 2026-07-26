// useLazy - Lazy loading utilities for performance

import { useState, useEffect } from 'react';

/**
 * useOnMount - Run effect only once on mount (like componentDidMount)
 */
export function useOnMount(callback) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      callback();
    }
  }, [mounted, callback]);
}

/**
 * useDefer - Defer non-critical updates
 */
export function useDefer(value, delay = 100) {
  const [deferredValue, setDeferredValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDeferredValue(value);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return deferredValue;
}

/**
 * usePrevious - Get previous value
 */
export function usePrevious(value) {
  const [previous, setPrevious] = useState();

  useEffect(() => {
    setPrevious(value);
  }, [value]);

  return previous;
}

/**
 * useRenderCount - Track component render count (for debugging)
 */
let renderCounts = {};

export function useRenderCount(name = 'Component') {
  if (!renderCounts[name]) {
    renderCounts[name] = 0;
  }

  useEffect(() => {
    renderCounts[name] = (renderCounts[name] || 0) + 1;
  });

  return renderCounts[name];
}

/**
 * Reset all render counts
 */
export function resetRenderCounts() {
  renderCounts = {};
}
