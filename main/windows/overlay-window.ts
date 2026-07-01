/**
 * Transparent full-screen drawing overlay.
 *
 * A frameless, transparent, always-on-top window sized to the primary display.
 * The renderer draws every visible pixel (a canvas + floating toolbar), so this
 * is the sanctioned use of `frame: false` + `transparent: true`.
 *
 * The window is created hidden at startup and toggled with show/hide so drawings
 * persist across activations (the window is never destroyed while the app runs).
 */

import { app, BrowserWindow, globalShortcut, screen } from "electron";
import { broadcast } from "../services/events.js";
import { getPreloadPath, getWindowUrl } from "./window-paths.js";
import { logger } from "../logger.js";

let overlayWindow: BrowserWindow | null = null;
let active = false;

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

function fitToPrimaryDisplay(win: BrowserWindow): void {
  const { bounds } = screen.getPrimaryDisplay();
  win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
}

export async function createOverlayWindow(): Promise<BrowserWindow> {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  logger.info("overlay", "Creating drawing overlay window");

  overlayWindow = new BrowserWindow({
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
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  fitToPrimaryDisplay(overlayWindow);

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    active = false;
  });

  const url = await getWindowUrl("overlay-window.html");
  await overlayWindow.loadURL(url);

  return overlayWindow;
}

export function isOverlayActive(): boolean {
  return active;
}

export async function setOverlayActive(next: boolean): Promise<void> {
  const win = await createOverlayWindow();

  active = next;

  if (next) {
    fitToPrimaryDisplay(win);
    win.setIgnoreMouseEvents(false);
    win.show();
    win.moveTop();
    // The overlay is usually toggled via a global shortcut while another app is
    // frontmost. Without activating our app, macOS keeps keyboard focus on that
    // app — clicks still register (acceptFirstMouse) but keydown shortcuts don't
    // reach the overlay. Steal focus so keyboard shortcuts work immediately.
    app.focus({ steal: true });
    win.focus();
    await registerDrawingShortcuts();
  } else {
    unregisterDrawingShortcuts();
    win.hide();
  }

  broadcast("overlay:active-changed", { active });
  logger.info("overlay", `Drawing overlay ${active ? "activated" : "deactivated"}`);
}

export async function toggleOverlay(): Promise<void> {
  await setOverlayActive(!active);
}
