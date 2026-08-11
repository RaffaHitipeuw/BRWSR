/*
 * GPU Compositing & Hardware Acceleration Utilities
 * Backend only - no UI changes
 *
 * These utilities enable hardware acceleration for smoother scrolling
 * and better rendering performance.
 */

/**
 * GPU Compositing CSS Class Names
 * Add these to elements for GPU acceleration
 */
export const GPU_CLASSES = {
  // Enable GPU compositing for an element
  composited: "gpu-composited",

  // Force GPU layer for frequently animated elements
  layer: "gpu-layer",

  // Smooth scrolling container
  smoothScroll: "smooth-scroll",

  // Will-change hint for upcoming animations
  willChange: "will-change-transform",
};

/**
 * CSS string to inject for GPU acceleration
 */
export const GPU_CSS = `
/* GPU Compositing */
.gpu-composited {
  transform: translateZ(0);
  will-change: transform;
  backface-visibility: hidden;
  perspective: 1000px;
}

.gpu-layer {
  transform: translate3d(0, 0, 0);
  will-change: transform;
  isolation: isolate;
}

/* Smooth Scrolling */
.smooth-scroll {
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* Will-change for upcoming animations */
.will-change-transform {
  will-change: transform;
}

.will-change-opacity {
  will-change: opacity;
}

.will-change-scroll {
  will-change: scroll-position;
}

/* Reduce paint areas */
.reduce-paint {
  contain: layout style paint;
}

.reduce-layout {
  contain: layout;
}

.reduce-style {
  contain: style;
}

/* GPU image rendering */
.gpu-image {
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}

/* Disable GPU for specific elements (power saving) */
.no-gpu {
  transform: none !important;
  will-change: auto !important;
}
`;

/**
 * Inject GPU CSS into the document
 * Note: CSS is now included in index.css for better performance
 */
export function initGPUAcceleration() {
  console.log("[GPU] Acceleration ready (CSS inlined)");
}

/**
 * Add GPU class to an element
 */
export function enableGPU(element: HTMLElement | null) {
  if (!element) return;
  element.classList.add(GPU_CLASSES.composited);
}

/**
 * Remove GPU class from an element
 */
export function disableGPU(element: HTMLElement | null) {
  if (!element) return;
  element.classList.remove(GPU_CLASSES.composited);
}

/**
 * Add will-change property temporarily for animations
 */
export function prepareForAnimation(element: HTMLElement | null, property = "transform") {
  if (!element) return;

  element.style.willChange = property;

  const cleanup = () => {
    element.style.willChange = "auto";
    element.removeEventListener("transitionend", cleanup);
    element.removeEventListener("animationend", cleanup);
  };

  element.addEventListener("transitionend", cleanup, { once: true });
  element.addEventListener("animationend", cleanup, { once: true });
}

/**
 * Force layer creation for an element
 */
export function forceLayer(element: HTMLElement | null) {
  if (!element) return;

  const methods = [
    () => {
      element.style.transform = "translateZ(0)";
    },
    () => {
      element.style.backfaceVisibility = "hidden";
    },
    () => {
      element.classList.add("gpu-layer");
    },
  ];

  methods.forEach((method) => {
    try {
      method();
    } catch (e) {
      console.warn("[GPU] Failed to force layer:", e);
    }
  });
}

/**
 * Check if GPU acceleration is available
 */
export function isGPUAvailable(): boolean {
  if (typeof window === "undefined") return false;

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

  return !!gl;
}

/**
 * Get GPU info for debugging
 */
export function getGPUInfo() {
  if (typeof window === "undefined") {
    return { available: false, renderer: "N/A", vendor: "N/A" };
  }

  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl") ||
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

  if (!gl) {
    return { available: false, renderer: "Not supported", vendor: "N/A" };
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");

  return {
    available: true,
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "Unknown",
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "Unknown",
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
  };
}

/**
 * Optimize scroll performance
 */
export function optimizeScroll(container: HTMLElement | null) {
  if (!container) return;

  container.classList.add("smooth-scroll");

  const addPassiveListener = (eventType: string) => {
    container.addEventListener(eventType, () => {}, { passive: true });
  };

  ["touchstart", "touchmove", "touchend", "wheel", "scroll"].forEach(addPassiveListener);

  container.style.contain = "strict";
}

/**
 * Batch DOM updates for better performance
 */
export function batchDOMUpdates(callback: () => void) {
  requestAnimationFrame(() => {
    callback();
  });
}

/**
 * Create offscreen element for heavy rendering
 */
export function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = "absolute";
  canvas.style.left = "-9999px";
  document.body.appendChild(canvas);
  return canvas;
}
