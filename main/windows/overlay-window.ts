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
import { getSettings } from "../services/settings-store.js";
import {
  getAdoptableCachedToolbarState,
  getCachedToolbarVanishing,
  setCachedToolbarVanishing,
} from "../services/toolbar-state-cache.js";
import { getPreloadPath, getWindowUrl } from "./window-paths.js";
import {
  createToolbarWindow,
  hideToolbarWindow,
  resetToolbarHidden,
  showToolbarWindow,
} from "./toolbar-window.js";
import { nextMode, type OverlayMode } from "../services/overlay-mode.js";
import {
  beginLatencyActivation,
  latencyActivationPayload,
  markDeferredFocusScheduled,
  measureLatencyStage,
  measureLatencyStageAsync,
  measureWindowOperation,
  recordBrowserWindowFocus,
  recordDeferredFocusFired,
  updateLatencyActivation,
} from "../services/latency-probe.js";
import { logger } from "../logger.js";

interface OverlayActivationOptions {
  displayId?: number;
  sourceWindow?: BrowserWindow | null;
  triggerSource?: string;
}

const overlayWindows = new Map<number, BrowserWindow>();
/**
 * Tri-state overlay mode. `drawing` is the interactive state; `sticky` keeps the
 * ink visible but click-through with the toolbar hidden; `hidden` is off. The
 * public `isOverlayActive()` maps `drawing → true`, so existing callers (focus,
 * shortcuts, publishing gates) keep their old meaning.
 */
let mode: OverlayMode = "hidden";
let activeDisplayId: number | null = null;
let displayListenersRegistered = false;
let deferredOverlayFocusTimer: ReturnType<typeof setTimeout> | null = null;
let textInputOpen = false;

// Undo/redo use ⌘Z / ⌘⇧Z, which macOS's Edit menu claims as key equivalents and
// swallows before they ever reach the overlay's keydown handler. Registering them
// as global shortcuts (only while drawing) takes precedence over the menu, so they
// reliably drive the overlay regardless of which window holds keyboard focus.
const UNDO_ACCEL = "CommandOrControl+Z";
const REDO_ACCEL = "CommandOrControl+Shift+Z";

async function registerDrawingShortcuts(): Promise<void> {
  // Register the more specific Shift+Z first; accelerators match exact modifier
  // sets, so ⌘⇧Z never falls through to the plain ⌘Z handler.
  if (!globalShortcut.isRegistered(REDO_ACCEL)) {
    globalShortcut.register(REDO_ACCEL, () => broadcast("overlay:redo", {}));
  }
  if (!globalShortcut.isRegistered(UNDO_ACCEL)) {
    globalShortcut.register(UNDO_ACCEL, () => broadcast("overlay:undo", {}));
  }
}

function unregisterDrawingShortcuts(): void {
  if (globalShortcut.isRegistered(UNDO_ACCEL)) globalShortcut.unregister(UNDO_ACCEL);
  if (globalShortcut.isRegistered(REDO_ACCEL)) globalShortcut.unregister(REDO_ACCEL);
}

function fitToDisplay(win: BrowserWindow, display: Display): void {
  const { bounds } = display;
  measureWindowOperation("overlay", display.id, "setBounds", "overlaySetBoundsMs", () =>
    win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }),
  );
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

function adoptSharedToolbarStateForDisplay(
  displayId: number | null,
  previousDisplayId: number | null,
): void {
  if (displayId === null || previousDisplayId === null || displayId === previousDisplayId) return;
  if (getSettings().toolbarPositionScope !== "shared") return;
  const toolbarState = getAdoptableCachedToolbarState();
  if (!toolbarState) return;
  broadcast("overlay:adoptToolState", { activeDisplayId: displayId, ...toolbarState });
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
      // Keep the hidden activation surface warm when the control panel is not visible.
      backgroundThrottling: false,
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
  return await measureLatencyStageAsync("syncOverlayWindowsMs", async () => {
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

    // Both drawing and sticky keep the overlay windows visible; only sticky makes
    // them click-through. A new display appearing mid-session must come up in the
    // right state (visible + ignoring mouse in sticky), so this mirrors the same
    // per-mode logic used when entering the mode.
    if (mode === "drawing" || mode === "sticky") {
      const ignoreMouse = mode === "sticky";
      for (const display of displays) {
        const win = overlayWindows.get(display.id);
        if (!win || win.isDestroyed()) continue;
        fitToDisplay(win, display);
        win.setIgnoreMouseEvents(ignoreMouse);
        // In sticky the overlays never take focus (they must not steal it from the
        // app the user is now working in), so every window shows inactive.
        if (mode === "drawing" && display.id === activeDisplayId) {
          measureWindowOperation("overlay", display.id, "show", "overlayShowMs", () => win.show());
        } else {
          measureWindowOperation(
            "overlay",
            display.id,
            "showInactive",
            "overlayShowInactiveMs",
            () => win.showInactive(),
          );
        }
        // macOS can re-constrain the frame while showing (nudging it below the
        // menu bar); re-fit after show so the overlay covers the whole display.
        fitToDisplay(win, display);
        measureWindowOperation("overlay", display.id, "moveTop", "overlayMoveTopMs", () =>
          win.moveTop(),
        );
      }
      // The toolbar only belongs to drawing mode; sticky hides it.
      if (mode === "drawing") showToolbarWindow(activeDisplayId);
    }

    return windows;
  });
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

/** Backward-compatible: true only in interactive drawing mode. */
export function isOverlayActive(): boolean {
  return mode === "drawing";
}

/** True when annotations are pinned (visible but click-through). */
export function isOverlaySticky(): boolean {
  return mode === "sticky";
}

export function getOverlayMode(): OverlayMode {
  return mode;
}

/**
 * Return keyboard focus to the active display's overlay. Called after a toolbar
 * button action, since clicking the (focusable) toolbar window would otherwise
 * keep focus off the overlay, starving its single-key shortcuts.
 */
export function focusActiveOverlay(): void {
  if (mode !== "drawing" || activeDisplayId === null) return;
  const win = overlayWindows.get(activeDisplayId);
  if (win && !win.isDestroyed()) win.focus();
}

export async function setOverlayTextInputOpen(open: boolean): Promise<void> {
  textInputOpen = open;
  if (mode !== "drawing") return;
  if (open) {
    unregisterDrawingShortcuts();
    if (activeDisplayId !== null) {
      const win = overlayWindows.get(activeDisplayId);
      if (win && !win.isDestroyed()) {
        app.focus({ steal: true });
        win.focus();
      }
    }
  } else {
    await registerDrawingShortcuts();
  }
}

function cancelDeferredOverlayFocus(): void {
  if (deferredOverlayFocusTimer === null) return;
  clearTimeout(deferredOverlayFocusTimer);
  deferredOverlayFocusTimer = null;
}

function deferActiveOverlayFocus(): void {
  cancelDeferredOverlayFocus();
  const scheduledAt = markDeferredFocusScheduled();
  deferredOverlayFocusTimer = setTimeout(() => {
    deferredOverlayFocusTimer = null;
    recordDeferredFocusFired(scheduledAt);
    if (mode !== "drawing" || activeDisplayId === null) return;
    const win = overlayWindows.get(activeDisplayId);
    if (!win || win.isDestroyed()) return;
    measureLatencyStage("appFocusCallMs", () => app.focus({ steal: true }));
    measureWindowOperation("overlay", activeDisplayId, "focus", "overlayFocusMs", () =>
      win.focus(),
    );
    recordBrowserWindowFocus(win);
  }, 16);
}

export function getActiveDisplayId(): number | null {
  return activeDisplayId;
}

export async function setOverlayActiveDisplay(displayId: number): Promise<void> {
  if (!getDisplayById(displayId)) {
    throw new Error(`Unknown display id: ${displayId}`);
  }

  const previousDisplayId = activeDisplayId;
  activeDisplayId = displayId;
  broadcastActiveDisplay();
  adoptSharedToolbarStateForDisplay(displayId, previousDisplayId);

  if (mode === "drawing") {
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

export function toggleOverlayVanishing(): void {
  const vanishing = !getCachedToolbarVanishing();
  setCachedToolbarVanishing(vanishing);
  if (getSettings().toolbarPositionScope === "shared") {
    broadcast("overlay:setVanishing", { vanishing });
    return;
  }
  broadcast("overlay:setVanishing", { activeDisplayId, vanishing });
}

/** Enter interactive drawing: overlays visible + interactive, toolbar + shortcuts on. */
async function enterDrawing(options: OverlayActivationOptions): Promise<void> {
  await measureLatencyStageAsync("enterDrawingMs", async () => {
    const previousDisplayId = activeDisplayId;
    activeDisplayId = getDisplayIdForActivation(options);
    updateLatencyActivation({ activeDisplayId });
    adoptSharedToolbarStateForDisplay(activeDisplayId, previousDisplayId);

    for (const [displayId, win] of overlayWindows) {
      const display = getDisplayById(displayId);
      if (!display || win.isDestroyed()) continue;
      fitToDisplay(win, display);
      win.setIgnoreMouseEvents(false);
      if (displayId === activeDisplayId) {
        measureWindowOperation("overlay", displayId, "show", "overlayShowMs", () => win.show());
      } else {
        measureWindowOperation("overlay", displayId, "showInactive", "overlayShowInactiveMs", () =>
          win.showInactive(),
        );
      }
      // macOS can re-constrain the frame while showing (nudging it below the
      // menu bar); re-fit after show so the overlay covers the whole display.
      fitToDisplay(win, display);
      measureWindowOperation("overlay", displayId, "moveTop", "overlayMoveTopMs", () =>
        win.moveTop(),
      );
    }

    // Re-entering drawing mode always reveals the toolbar (the `T` toggle is
    // session-only). Raise it after the overlays so it stays clickable above
    // them (same screen-saver level). Show it before focusing the app so the
    // first visible activation cue is not gated on macOS app activation.
    resetToolbarHidden();
    showToolbarWindow(activeDisplayId);

    // The overlay is usually toggled via a global shortcut while another app is
    // frontmost. Without activating our app, macOS keeps keyboard focus on that
    // app — clicks still register (acceptFirstMouse) but keydown shortcuts don't
    // reach the overlay. Defer stealing focus by one frame so the visible toolbar
    // is not gated on macOS app activation while switching between apps.
    if (!textInputOpen) await registerDrawingShortcuts();
    deferActiveOverlayFocus();

    // Keep keyboard focus on the active overlay: showing the toolbar must not
    // steal the focus that the overlay's single-key shortcuts depend on.
  });
}

/**
 * Pin the annotations: keep the overlay windows VISIBLE but make them
 * click-through, hide the toolbar, and release the drawing shortcuts so the
 * user's apps get mouse and keyboard back. The overlays keep their shapes —
 * pinning never wipes; only a FULL exit with session ink ON resets the model.
 */
function enterSticky(): void {
  cancelDeferredOverlayFocus();
  textInputOpen = false;
  unregisterDrawingShortcuts();
  hideToolbarWindow();

  for (const [displayId, win] of overlayWindows) {
    const display = getDisplayById(displayId);
    if (!display || win.isDestroyed()) continue;
    fitToDisplay(win, display);
    // Click-through: pointer events fall through to whatever is underneath.
    win.setIgnoreMouseEvents(true);
    // Stay visible but never take focus — the user is now working in another app.
    win.showInactive();
    fitToDisplay(win, display);
    win.moveTop();
    logger.info("overlay", `Overlay ${displayId} setIgnoreMouseEvents(true) (sticky)`);
  }

  // Drop the focus we were holding so keyboard events reach the frontmost app.
  overlayWindows.get(activeDisplayId ?? -1)?.blur();
}

/** Full exit: hide everything and release the drawing shortcuts. */
function enterHidden(): void {
  cancelDeferredOverlayFocus();
  textInputOpen = false;
  unregisterDrawingShortcuts();
  hideToolbarWindow();
  for (const win of overlayWindows.values()) {
    if (!win.isDestroyed()) win.hide();
  }
}

/** Apply a target mode: run the matching side effects and broadcast the change. */
async function applyMode(next: OverlayMode, options: OverlayActivationOptions = {}): Promise<void> {
  if (next === "drawing") {
    beginLatencyActivation(options.triggerSource ?? "direct", { fromMode: mode, toMode: next });
  }

  await measureLatencyStageAsync("applyModeMs", async () => {
    // Set the mode BEFORE syncing so syncOverlayWindows runs the target mode's
    // window block (e.g. a pin doesn't first run the drawing show-block — toolbar
    // up, overlay focused — only for enterSticky to immediately reverse it).
    mode = next;

    await syncOverlayWindows();

    if (next === "drawing") await enterDrawing(options);
    else if (next === "sticky") enterSticky();
    else enterHidden();

    broadcast("overlay:active-changed", {
      active: mode === "drawing",
      sticky: mode === "sticky",
      activeDisplayId,
      ...latencyActivationPayload(),
    });
    broadcastActiveDisplay();
    logger.info("overlay", `Drawing overlay mode → ${mode}`);
  });
}

export async function setOverlayActive(
  next: boolean,
  options: OverlayActivationOptions = {},
): Promise<void> {
  // The boolean contract stays literal: true → drawing, false → hidden.
  await applyMode(next ? "drawing" : "hidden", options);
}

/** Pin the annotations (drawing → sticky); a no-op from any other mode. */
export async function setOverlaySticky(): Promise<void> {
  await applyMode(nextMode(mode, "pin"));
}

export async function toggleOverlay(options: OverlayActivationOptions = {}): Promise<void> {
  // Routed through the pure transition so sticky → drawing (resume) and
  // hidden ↔ drawing all follow one table.
  await applyMode(nextMode(mode, "toggle"), options);
}
