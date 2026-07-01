/**
 * Pure helpers for the floating toolbar's persisted position.
 *
 * No DOM or Electron imports — unit testable in plain Node. The overlay
 * component passes the current viewport size in.
 */

import type { ToolbarPosition } from "./constants";

/** Minimum toolbar width that must remain visible for a stored position to be usable. */
export const TOOLBAR_MIN_VISIBLE_WIDTH = 40;
/** The toolbar's height (h-9), which must fit fully inside the viewport. */
export const TOOLBAR_HEIGHT = 36;

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Validate a stored toolbar position against the current viewport.
 * Returns the position if it is usable, or null to fall back to the default
 * bottom-center placement (unset, malformed, or off-screen after display changes).
 */
export function sanitizeToolbarPosition(pos: unknown, viewport: Viewport): ToolbarPosition | null {
  if (typeof pos !== "object" || pos === null) return null;
  const { x, y } = pos as Partial<Record<"x" | "y", unknown>>;
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0) return null;
  if (x > viewport.width - TOOLBAR_MIN_VISIBLE_WIDTH) return null;
  if (y > viewport.height - TOOLBAR_HEIGHT) return null;
  return { x, y };
}

/** Clamp a dragged position so the toolbar always stays reachable in the viewport. */
export function clampToolbarPosition(pos: ToolbarPosition, viewport: Viewport): ToolbarPosition {
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, viewport.width - TOOLBAR_MIN_VISIBLE_WIDTH)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, viewport.height - TOOLBAR_HEIGHT)),
  };
}
