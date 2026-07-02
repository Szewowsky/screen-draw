/**
 * Pure tri-state transition logic for the drawing overlay.
 *
 * The overlay has three modes:
 * - `drawing` — overlays visible and interactive, toolbar shown, ⌘Z/⌘⇧Z drawing
 *   shortcuts registered. The normal drawing state.
 * - `sticky` — annotations pinned: overlays stay visible but click-through
 *   (`setIgnoreMouseEvents(true)`), the toolbar is hidden, and drawing shortcuts
 *   are released so normal apps get mouse and keyboard back. An alternative exit
 *   from drawing that leaves the ink on screen.
 * - `hidden` — everything hidden; the resting state.
 *
 * Kept free of Electron/DOM so it can be unit-tested: `main/windows/overlay-window.ts`
 * owns the side effects and reads the next mode from `nextMode`.
 */

export type OverlayMode = "drawing" | "sticky" | "hidden";

/**
 * A user-driven transition:
 * - `toggle` — the global shortcut, tray "Toggle Drawing", and the panel button.
 *   From `hidden` it starts drawing; from either `drawing` or `sticky` it exits to
 *   `hidden`… except that resuming from `sticky` is handled by the panel/tray/global
 *   toggle as a return TO drawing. See below.
 * - `pin` — pin the annotations (drawing → sticky). A no-op from any other mode.
 */
export type OverlayModeEvent = "toggle" | "pin";

/**
 * Resolve the next mode for a user event.
 *
 * `toggle` semantics: `hidden` → `drawing` (start), `drawing` → `hidden` (stop),
 * and `sticky` → `drawing` (resume). Sticky is a paused drawing session, so the
 * same control that starts/stops drawing resumes it rather than hiding it — the
 * annotations are already on screen and the user wants them back under the pen.
 *
 * `pin` semantics: `drawing` → `sticky`; a defensive no-op from `sticky`/`hidden`
 * (there is nothing to pin).
 */
export function nextMode(mode: OverlayMode, event: OverlayModeEvent): OverlayMode {
  if (event === "pin") {
    return mode === "drawing" ? "sticky" : mode;
  }
  // toggle
  switch (mode) {
    case "hidden":
      return "drawing";
    case "sticky":
      return "drawing";
    case "drawing":
      return "hidden";
  }
}
