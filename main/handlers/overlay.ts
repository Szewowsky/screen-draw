/**
 * IPC handlers for the drawing overlay and its settings.
 *
 * Thin boundary: validates inputs, then delegates to the overlay window and the
 * settings store. Setting mutations re-register the shortcut where needed and
 * broadcast a change event so the control window stays in sync.
 */

import { BrowserWindow, ipcMain } from "electron";

import {
  getSettings,
  setDefaults,
  setShortcut,
  type CursorHighlightSettings,
  type EffectsShortcuts,
  type ScreenDrawSettings,
  type SpotlightSettings,
} from "../services/settings-store.js";
import { broadcast } from "../services/events.js";
import {
  getEffectsShortcutStatus,
  getShortcutStatus,
  registerEffectsShortcuts,
  registerToggleShortcut,
} from "../services/shortcut.js";
import {
  getActiveDisplayId,
  isOverlayActive,
  isOverlaySticky,
  setOverlayActive,
  setOverlayActiveDisplay,
  setOverlaySticky,
  setOverlayTextInputOpen,
  syncOverlayEffectsFromSettings,
  toggleOverlayVanishing,
} from "../windows/overlay-window.js";
import { applyContentProtection } from "../windows/toolbar-window.js";

/** The overlay state shape returned to and broadcast at renderers. */
function overlayState() {
  return {
    active: isOverlayActive(),
    sticky: isOverlaySticky(),
    activeDisplayId: getActiveDisplayId(),
  };
}

function objectValue(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function cursorHighlightInput(raw: unknown): Partial<CursorHighlightSettings> | undefined {
  const value = objectValue(raw);
  if (!value) return undefined;
  return {
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
    ...(typeof value.color === "string" ? { color: value.color } : {}),
    ...(typeof value.size === "number" ? { size: value.size } : {}),
    ...(typeof value.opacity === "number" ? { opacity: value.opacity } : {}),
  };
}

function spotlightInput(raw: unknown): Partial<SpotlightSettings> | undefined {
  const value = objectValue(raw);
  if (!value) return undefined;
  return {
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
    ...(typeof value.radius === "number" ? { radius: value.radius } : {}),
    ...(typeof value.dimOpacity === "number" ? { dimOpacity: value.dimOpacity } : {}),
  };
}

function effectsShortcutsInput(raw: unknown): Partial<EffectsShortcuts> | undefined {
  const value = objectValue(raw);
  if (!value) return undefined;
  return {
    ...(typeof value.highlight === "string" ? { highlight: value.highlight } : {}),
    ...(typeof value.spotlight === "string" ? { spotlight: value.spotlight } : {}),
  };
}

export function registerOverlayHandlers(): void {
  ipcMain.handle("overlay:setActive", async (event, active: unknown) => {
    if (typeof active !== "boolean") {
      throw new Error("overlay:setActive expects a boolean");
    }
    await setOverlayActive(active, {
      sourceWindow: BrowserWindow.fromWebContents(event.sender),
      triggerSource: "ipc:overlay:setActive",
    });
    return overlayState();
  });

  ipcMain.handle("overlay:getState", async () => {
    return overlayState();
  });

  // Pin the annotations (drawing → sticky). Sender-agnostic: the toolbar's pin
  // button routes here via the shared toolbar:action handler, and the overlay's
  // `S` shortcut invokes it directly.
  ipcMain.handle("overlay:setSticky", async () => {
    await setOverlaySticky();
    return overlayState();
  });

  ipcMain.handle("overlay:setActiveDisplay", async (_event, displayId: unknown) => {
    if (typeof displayId !== "number") {
      throw new Error("overlay:setActiveDisplay expects a display id");
    }
    await setOverlayActiveDisplay(displayId);
    return overlayState();
  });

  ipcMain.handle("overlay:toggleVanishing", async () => {
    toggleOverlayVanishing();
    return overlayState();
  });

  ipcMain.handle("overlay:textInputOpen", async (_event, open: unknown) => {
    if (typeof open !== "boolean") {
      throw new Error("overlay:textInputOpen expects a boolean");
    }
    await setOverlayTextInputOpen(open);
    return overlayState();
  });

  ipcMain.handle("settings:get", async (): Promise<ScreenDrawSettings> => {
    return getSettings();
  });

  ipcMain.handle("settings:setShortcut", async (_event, shortcut: unknown) => {
    if (typeof shortcut !== "string") {
      throw new Error("settings:setShortcut expects a string accelerator");
    }
    const next = setShortcut(shortcut);
    const registered = await registerToggleShortcut(next.shortcut);
    broadcast("settings:changed", next);
    return { settings: next, registered, status: getShortcutStatus() };
  });

  ipcMain.handle("shortcut:getStatus", async () => {
    return getShortcutStatus();
  });

  ipcMain.handle("effects-shortcuts:getStatus", async () => {
    return getEffectsShortcutStatus();
  });

  ipcMain.handle(
    "settings:setDefaults",
    async (_event, partial: unknown): Promise<ScreenDrawSettings> => {
      const input = (partial ?? {}) as {
        defaultColor?: unknown;
        defaultSize?: unknown;
        toolbarPosition?: unknown;
        toolbarPositionScope?: unknown;
        recentColor?: unknown;
        hideToolbarInRecordings?: unknown;
        toggleHideToolbarInRecordings?: unknown;
        cursorHighlight?: unknown;
        toggleCursorHighlight?: unknown;
        spotlight?: unknown;
        toggleSpotlight?: unknown;
        effectsShortcuts?: unknown;
      };
      const position = input.toolbarPosition as { x?: unknown; y?: unknown } | null | undefined;
      const toolbarPosition =
        position === null
          ? null
          : typeof position?.x === "number" && typeof position?.y === "number"
            ? { x: position.x, y: position.y }
            : undefined;
      const next = setDefaults({
        defaultColor: typeof input.defaultColor === "string" ? input.defaultColor : undefined,
        defaultSize: typeof input.defaultSize === "number" ? input.defaultSize : undefined,
        toolbarPosition,
        toolbarPositionDisplayId: toolbarPosition !== undefined ? getActiveDisplayId() : undefined,
        toolbarPositionScope:
          input.toolbarPositionScope === "shared" || input.toolbarPositionScope === "per-display"
            ? input.toolbarPositionScope
            : undefined,
        recentColor: typeof input.recentColor === "string" ? input.recentColor : undefined,
        hideToolbarInRecordings:
          typeof input.hideToolbarInRecordings === "boolean"
            ? input.hideToolbarInRecordings
            : undefined,
        toggleHideToolbarInRecordings: input.toggleHideToolbarInRecordings === true,
        cursorHighlight: cursorHighlightInput(input.cursorHighlight),
        toggleCursorHighlight: input.toggleCursorHighlight === true,
        spotlight: spotlightInput(input.spotlight),
        toggleSpotlight: input.toggleSpotlight === true,
        effectsShortcuts: effectsShortcutsInput(input.effectsShortcuts),
      });
      // Re-apply content protection to the toolbar window whenever the setting
      // may have changed (no-op if it did not).
      applyContentProtection();
      await syncOverlayEffectsFromSettings();
      if (input.effectsShortcuts !== undefined) {
        await registerEffectsShortcuts(next.effectsShortcuts);
      }
      broadcast("settings:changed", next);
      return next;
    },
  );
}
