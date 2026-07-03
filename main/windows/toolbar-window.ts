/**
 * The dedicated floating-toolbar window.
 *
 * A single frameless, transparent, always-on-top window (screen-saver level, so
 * it floats above the overlays) that hosts the drawing toolbar. It follows the
 * active display: shown while drawing mode is on, hidden when it is off, and
 * moved when the active display changes.
 *
 * The window is sized to the toolbar's rendered content. The renderer measures
 * its bar and reports the desired geometry over `toolbar:setBounds`; main
 * translates the display-relative request into absolute screen coordinates
 * within the active display's work area and applies it with `setBounds`.
 *
 * Content protection (`hideToolbarInRecordings`) is applied to THIS window only,
 * so the toolbar disappears from screen recordings while staying visible on the
 * physical screen. The overlay windows are never protected — drawings must stay
 * capturable.
 */

import { BrowserWindow, screen, type Display } from "electron";
import { getPreloadPath, getWindowUrl } from "./window-paths.js";
import { getSettings } from "../services/settings-store.js";
import {
  measureLatencyStage,
  measureWindowOperation,
  recordToolbarCrossedDisplays,
} from "../services/latency-probe.js";
import { logger } from "../logger.js";

let toolbarWindow: BrowserWindow | null = null;
/** Session-only visibility toggled by `T`; reset to visible when drawing re-activates. */
let userHidden = false;
/** Latest content size reported by the renderer, kept so active-display moves can re-place. */
let lastBounds: { width: number; height: number; x: number; y: number } | null = null;
/** Last display the toolbar was intentionally shown or placed on. */
let lastToolbarDisplayId: number | null = null;

function getDisplayById(displayId: number): Display | undefined {
  return screen.getAllDisplays().find((display) => display.id === displayId);
}

/** Work area of the active display; the toolbar clamps and positions within it. */
function activeWorkArea(activeDisplayId: number | null): Electron.Rectangle {
  const display =
    (activeDisplayId !== null ? getDisplayById(activeDisplayId) : undefined) ??
    screen.getPrimaryDisplay();
  return display.workArea;
}

export function getActiveWorkArea(activeDisplayId: number | null): Electron.Rectangle {
  return activeWorkArea(activeDisplayId);
}

export async function createToolbarWindow(): Promise<BrowserWindow> {
  if (toolbarWindow && !toolbarWindow.isDestroyed()) return toolbarWindow;

  logger.info("toolbar", "Creating toolbar window");

  const win = new BrowserWindow({
    width: 600,
    height: 40,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    focusable: true,
    acceptFirstMouse: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // The toolbar is the first visible activation cue; don't let hidden-window
      // throttling cold-start it when the control panel is closed or behind apps.
      backgroundThrottling: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // One sublevel ABOVE the overlays (same base level): focusing or moveTop-ing
  // an overlay reorders windows only within its own level, so the toolbar can
  // never sink underneath and stop receiving clicks.
  win.setAlwaysOnTop(true, "screen-saver", 1);

  win.on("closed", () => {
    toolbarWindow = null;
  });

  // Assign before applying content protection so it operates on this window.
  toolbarWindow = win;
  applyContentProtection();

  const url = await getWindowUrl("toolbar-window.html");
  await win.loadURL(url);

  return win;
}

export function getToolbarWindow(): BrowserWindow | null {
  return toolbarWindow;
}

/**
 * Apply the toolbar window's absolute bounds from a display-relative request.
 * `position` is relative to the active display's work area (or null for the
 * default bottom-center placement); `width`/`height` are the measured content
 * size. Returns the work area so the renderer can clamp against the true size.
 */
export function setToolbarBounds(
  activeDisplayId: number | null,
  request: { width: number; height: number; x: number; y: number },
): void {
  const win = toolbarWindow;
  if (!win || win.isDestroyed()) return;
  const wa = activeWorkArea(activeDisplayId);
  const width = Math.max(1, Math.round(request.width));
  const height = Math.max(1, Math.round(request.height));
  const x = Math.round(wa.x + request.x);
  const y = Math.round(wa.y + request.y);
  lastBounds = { width, height, x, y };
  measureWindowOperation("toolbar", activeDisplayId, "setBounds", "toolbarSetBoundsMs", () =>
    win.setBounds({ x, y, width, height }),
  );
  if (activeDisplayId !== null) lastToolbarDisplayId = activeDisplayId;
}

/** Whether the toolbar should currently be visible (drawing on and not user-hidden). */
export function showToolbarWindow(activeDisplayId: number | null): void {
  measureLatencyStage("showToolbarWindowMs", () => {
    const win = toolbarWindow;
    if (!win || win.isDestroyed()) return;
    if (userHidden) {
      win.hide();
      return;
    }
    recordToolbarCrossedDisplays(
      lastToolbarDisplayId !== null &&
        activeDisplayId !== null &&
        lastToolbarDisplayId !== activeDisplayId,
    );
    measureWindowOperation(
      "toolbar",
      activeDisplayId,
      "showInactive",
      "toolbarShowInactiveMs",
      () => win.showInactive(),
    );
    // Same screen-saver level as the overlays, which call moveTop on show; raise
    // the toolbar afterwards so it stays clickable above them.
    measureWindowOperation("toolbar", activeDisplayId, "moveTop", "toolbarMoveTopMs", () =>
      win.moveTop(),
    );
    // Re-apply the last known bounds so an active-display move lands the toolbar in
    // the new display's work area even before the renderer re-measures.
    const bounds = lastBounds;
    if (bounds) {
      const wa = activeWorkArea(activeDisplayId);
      // lastBounds.x/y are absolute; recompute relative offset is unknown here, so
      // the renderer re-measures on active-changed. Only clamp into the new area,
      // accounting for the window size so a bottom-right-parked toolbar does not
      // hang off the new display's edge (floor at the work-area origin).
      const x = Math.max(wa.x, Math.min(bounds.x, wa.x + wa.width - bounds.width));
      const y = Math.max(wa.y, Math.min(bounds.y, wa.y + wa.height - bounds.height));
      measureWindowOperation("toolbar", activeDisplayId, "setBounds", "toolbarSetBoundsMs", () =>
        win.setBounds({ x, y, width: bounds.width, height: bounds.height }),
      );
    }
    if (activeDisplayId !== null) lastToolbarDisplayId = activeDisplayId;
  });
}

export function hideToolbarWindow(): void {
  const win = toolbarWindow;
  if (win && !win.isDestroyed()) win.hide();
}

/**
 * Toggle the session-only user-hidden state (the `T` shortcut). Hiding hides the
 * window; unhiding re-shows it on the active display.
 */
export function toggleToolbarHidden(activeDisplayId: number | null): void {
  userHidden = !userHidden;
  if (userHidden) hideToolbarWindow();
  else showToolbarWindow(activeDisplayId);
}

/** Reset the session hidden flag (re-entering drawing mode always shows the toolbar). */
export function resetToolbarHidden(): void {
  userHidden = false;
}

/**
 * Apply `hideToolbarInRecordings` to the toolbar window only. Logged so the
 * applied state is verifiable from stdout (the actual capture-invisibility is
 * owner QA).
 */
export function applyContentProtection(): void {
  const win = toolbarWindow;
  if (!win || win.isDestroyed()) return;
  const enabled = getSettings().hideToolbarInRecordings === true;
  win.setContentProtection(enabled);
  logger.info(
    "toolbar",
    `Toolbar contentProtection ${enabled ? "enabled" : "disabled"} (hideToolbarInRecordings=${enabled})`,
  );
}
