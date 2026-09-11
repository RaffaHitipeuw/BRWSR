import { useCallback, useRef } from "react";
import { browserCommands } from "../components/browserCommands";

/**
 * Coordinate system reference:
 *
 * Screen physical pixels (Win32 GetWindowRect):
 *   Main window: (169, 41, 1769, 1041) — 1600×1000 physical
 *   Browser WRY: (169, 151, 1769, 1041) — 1600×890 physical
 *   Browser WRY top offset from main window top = 110 physical px
 *
 * Scale factor: physical / logical = 1600 / 1280 = 1.25
 *
 * Viewport / DOM (getBoundingClientRect):
 *   Origin (0,0) = top-left of browser content area.
 *   The UI bar (address bar + nav controls) is ABOVE the viewport,
 *   taking ~43 viewport px (≈ 54 physical px at scale=1.25).
 *
 * Browser WRY local coordinates:
 *   Origin (0,0) = top-left of browser WRY window, same as viewport origin.
 *   Viewport coords → browser-local coords: no transformation needed.
 *
 * Physical pixels (what SetWindowRgn needs):
 *   viewportLogical × scale_factor = physical
 *
 * Example: dropdown at viewport (20, 60) size (300, 400):
 *   browser-local: (20, 60) size (300, 400)
 *   physical:      (25, 75) size (375, 500)  [×1.25]
 *
 * So to convert overlay DOM rect to SetWindowRgn coords:
 *   x_physical = rect.left * scale_factor
 *   y_physical = rect.top * scale_factor
 *   width_physical = rect.width * scale_factor
 *   height_physical = rect.height * scale_factor
 */

/** Hardcoded scale factor matching the current DPI. */
const SCALE_FACTOR = 1.25;

export function useBrowserOverlayExclusion() {
  const activeCount = useRef(0);

  /** Call with the element's getBoundingClientRect() result to report an overlay.
   *
   * Coordinate conversion:
   * - getBoundingClientRect() returns viewport-relative logical coords
   * - Viewport origin = browser WRY content origin
   * - Multiply by scale factor to get physical coords for SetWindowRgn
   *
   * The overlay is excluded from the browser WRY's painting area using a
   * compound window region (RGN_DIFF), so the browser content does NOT paint
   * behind the overlay — revealing the React UI beneath it. */
  const setExclusion = useCallback(
    async (rect: DOMRect | { left: number; top: number; width: number; height: number }) => {
      // Convert viewport logical coords → browser WRY physical coords
      const x = Math.round(rect.left * SCALE_FACTOR);
      const y = Math.round(rect.top * SCALE_FACTOR);
      const width = Math.round(rect.width * SCALE_FACTOR);
      const height = Math.round(rect.height * SCALE_FACTOR);

      // Sanity check: only register meaningful rects
      if (width <= 0 || height <= 0) return;

      activeCount.current += 1;
      try {
        await browserCommands.setOverlayExclusions([{ x, y, width, height }]);
      } catch (err) {
        activeCount.current -= 1;
        console.error("[useBrowserOverlay] setOverlayExclusions failed:", err);
      }
    },
    [],
  );

  /** Clear all overlay exclusions. Call when overlays close. */
  const clearExclusions = useCallback(async () => {
    if (activeCount.current === 0) return;
    activeCount.current = 0;
    try {
      await browserCommands.clearOverlayExclusions();
    } catch (err) {
      console.error("[useBrowserOverlay] clearOverlayExclusions failed:", err);
    }
  }, []);

  return { setExclusion, clearExclusions, activeCount };
}
