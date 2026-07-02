/**
 * Transparent full-screen drawing overlays.
 *
 * A frameless, transparent, always-on-top window is created for every connected
 * display. The renderer draws every visible pixel (a canvas + floating toolbar),
 * so this is the sanctioned use of `frame: false` + `transparent: true`.
 *
 * The window is created hidden at startup and toggled with show/hide so drawings
 * persist across activations (windows are never destroyed while their display
 * remains connected).
 */

import { app, BrowserWindow, globalShortcut, screen, type Display } from "electron";
import { broadcast } from "../services/events.js";
import { getPreloadPath, getWindowUrl } from "./window-paths.js";
import {
  createToolbarWindow,
  hideToolbarWindow,
  resetToolbarHidden,
  showToolbarWindow,
} from "./toolbar-window.js";
import { logger } from "../logger.js";

interface OverlayActivationOptions {
  displayId?: number;
  sourceWindow?: BrowserWindow | null;
}

const overlayWindows = new Map<number, BrowserWindow>();
let active = false;
let activeDisplayId: number | null = null;
let displayListenersRegistered = false;

// Undo/redo use ⌘Z / ⌘⇧Z, which macOS's Edit menu claims as key equivalents and
// swallows before they ever reach the overlay's keydown handler. Registering them
// as global shortcuts (only while drawing) takes precedence over the menu, so they
// reliably drive the overlay regardless of which window holds keyboard focus.
const UNDO_ACCEL = "CommandOrControl+Z";
const REDO_ACCEL = "CommandOrControl+Shift+Z";

async function registerDrawingShortcuts(): Promise<void> {
  // Register the more specific Shift+Z first; accelerators match exact modifier
  // sets, so ⌘⇧Z never falls through to the plain ⌘Z handler.
  globalShortcut.register(REDO_ACCEL, () => broadcast("overlay:redo", {}));
  globalShortcut.register(UNDO_ACCEL, () => broadcast("overlay:undo", {}));
}

function unregisterDrawingShortcuts(): void {
  if (globalShortcut.isRegistered(UNDO_ACCEL)) globalShortcut.unregister(UNDO_ACCEL);
  if (globalShortcut.isRegistered(REDO_ACCEL)) globalShortcut.unregister(REDO_ACCEL);
}

function fitToDisplay(win: BrowserWindow, display: Display): void {
  const { bounds } = display;
  win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
}

function getDisplayById(displayId: number): Display | undefined {
  return screen.getAllDisplays().find((display) => display.id === displayId);
}

function getCursorDisplay(): Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function getWindowDisplay(win: BrowserWindow): Display {
  const bounds = win.getBounds();
  return screen.getDisplayNearestPoint({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  });
}

function getDisplayIdForActivation(options: OverlayActivationOptions = {}): number {
  if (typeof options.displayId === "number" && getDisplayById(options.displayId)) {
    return options.displayId;
  }
  if (options.sourceWindow && !options.sourceWindow.isDestroyed()) {
    return getWindowDisplay(options.sourceWindow).id;
  }
  return getCursorDisplay().id;
}

function withDisplayId(url: string, displayId: number): string {
  const next = new URL(url);
  next.searchParams.set("displayId", String(displayId));
  return next.toString();
}

function broadcastActiveDisplay(): void {
  broadcast("overlay:active-display-changed", { activeDisplayId });
}

async function createOverlayWindowForDisplay(display: Display): Promise<BrowserWindow> {
  const existing = overlayWindows.get(display.id);
  if (existing && !existing.isDestroyed()) {
    fitToDisplay(existing, display);
    return existing;
  }

  logger.info("overlay", `Creating drawing overlay window for display ${display.id}`);

  const win = new BrowserWindow({
    // Position at the target display up front — a later setBounds alone can be
    // re-constrained by macOS (windows get nudged below the menu bar), leaving
    // the overlay offset from its display.
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    enableLargerThanScreen: true,
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
    },
  });

  // Float above everything (including the menu bar) and follow the user across Spaces.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  fitToDisplay(win, display);

  win.on("closed", () => {
    overlayWindows.delete(display.id);
  });

  const url = await getWindowUrl("overlay-window.html");
  await win.loadURL(withDisplayId(url, display.id));
  overlayWindows.set(display.id, win);

  return win;
}

async function syncOverlayWindows(): Promise<BrowserWindow[]> {
  ensureDisplayListeners();

  const displays = screen.getAllDisplays();
  const displayIds = new Set(displays.map((display) => display.id));

  for (const [displayId, win] of overlayWindows) {
    if (!displayIds.has(displayId) && !win.isDestroyed()) {
      win.close();
    }
  }

  const windows = await Promise.all(
    displays.map((display) => createOverlayWindowForDisplay(display)),
  );

  if (activeDisplayId !== null && !displayIds.has(activeDisplayId)) {
    activeDisplayId = getDisplayIdForActivation();
    broadcastActiveDisplay();
  }

  if (active) {
    for (const display of displays) {
      const win = overlayWindows.get(display.id);
      if (!win || win.isDestroyed()) continue;
      fitToDisplay(win, display);
      win.setIgnoreMouseEvents(false);
      if (display.id === activeDisplayId) {
        win.show();
      } else {
        win.showInactive();
      }
      // macOS can re-constrain the frame while showing (nudging it below the
      // menu bar); re-fit after show so the overlay covers the whole display.
      fitToDisplay(win, display);
      win.moveTop();
    }
    // Keep the toolbar above the re-shown overlays (same screen-saver level).
    showToolbarWindow(activeDisplayId);
  }

  return windows;
}

function ensureDisplayListeners(): void {
  if (displayListenersRegistered) return;
  displayListenersRegistered = true;

  const onDisplayConfigurationChanged = () => {
    syncOverlayWindows().catch((error) => {
      logger.error("overlay", "Failed to sync overlay windows after display change", error);
    });
  };

  screen.on("display-added", onDisplayConfigurationChanged);
  screen.on("display-removed", onDisplayConfigurationChanged);
  screen.on("display-metrics-changed", onDisplayConfigurationChanged);
}

export async function createOverlayWindow(): Promise<BrowserWindow> {
  const windows = await syncOverlayWindows();
  // Create the toolbar window AFTER the overlays so it can sit above them at the
  // shared screen-saver level (it is raised again on each show/active change).
  await createToolbarWindow();
  const targetDisplayId = activeDisplayId ?? getCursorDisplay().id;
  const target = overlayWindows.get(targetDisplayId);
  if (target && !target.isDestroyed()) return target;
  const first = windows.find((win) => !win.isDestroyed());
  if (!first) throw new Error("No displays available for overlay window");
  return first;
}

export function isOverlayActive(): boolean {
  return active;
}

/**
 * Return keyboard focus to the active display's overlay. Called after a toolbar
 * button action, since clicking the (focusable) toolbar window would otherwise
 * keep focus off the overlay, starving its single-key shortcuts.
 */
export function focusActiveOverlay(): void {
  if (!active || activeDisplayId === null) return;
  const win = overlayWindows.get(activeDisplayId);
  if (win && !win.isDestroyed()) win.focus();
}

export function getActiveDisplayId(): number | null {
  return activeDisplayId;
}

export async function setOverlayActiveDisplay(displayId: number): Promise<void> {
  if (!getDisplayById(displayId)) {
    throw new Error(`Unknown display id: ${displayId}`);
  }

  activeDisplayId = displayId;
  broadcastActiveDisplay();

  if (active) {
    await syncOverlayWindows();
    const win = overlayWindows.get(displayId);
    if (win && !win.isDestroyed()) {
      app.focus({ steal: true });
      win.focus();
    }
    // Move the toolbar onto the newly-active display and raise it above the
    // overlays (which moveTop on sync). The renderer re-measures its geometry
    // off the active-display broadcast and reports fresh bounds.
    showToolbarWindow(displayId);
    win?.focus();
  }

  logger.info("overlay", `Active drawing display changed to ${displayId}`);
}

export async function setOverlayActive(
  next: boolean,
  options: OverlayActivationOptions = {},
): Promise<void> {
  await syncOverlayWindows();

  active = next;

  if (next) {
    activeDisplayId = getDisplayIdForActivation(options);

    for (const [displayId, win] of overlayWindows) {
      const display = getDisplayById(displayId);
      if (!display || win.isDestroyed()) continue;
      fitToDisplay(win, display);
      win.setIgnoreMouseEvents(false);
      if (displayId === activeDisplayId) {
        win.show();
      } else {
        win.showInactive();
      }
      // macOS can re-constrain the frame while showing (nudging it below the
      // menu bar); re-fit after show so the overlay covers the whole display.
      fitToDisplay(win, display);
      win.moveTop();
    }

    // The overlay is usually toggled via a global shortcut while another app is
    // frontmost. Without activating our app, macOS keeps keyboard focus on that
    // app — clicks still register (acceptFirstMouse) but keydown shortcuts don't
    // reach the overlay. Steal focus so keyboard shortcuts work immediately.
    app.focus({ steal: true });
    overlayWindows.get(activeDisplayId)?.focus();
    await registerDrawingShortcuts();

    // Re-entering drawing mode always reveals the toolbar (the `T` toggle is
    // session-only). Raise it after the overlays so it stays clickable above
    // them (same screen-saver level).
    resetToolbarHidden();
    showToolbarWindow(activeDisplayId);
    // Keep keyboard focus on the active overlay: showing the toolbar must not
    // steal the focus that the overlay's single-key shortcuts depend on.
    overlayWindows.get(activeDisplayId)?.focus();
  } else {
    unregisterDrawingShortcuts();
    hideToolbarWindow();
    for (const win of overlayWindows.values()) {
      if (!win.isDestroyed()) win.hide();
    }
  }

  broadcast("overlay:active-changed", { active, activeDisplayId });
  broadcastActiveDisplay();
  logger.info("overlay", `Drawing overlay ${active ? "activated" : "deactivated"}`);
}

export async function toggleOverlay(options: OverlayActivationOptions = {}): Promise<void> {
  await setOverlayActive(!active, options);
}
