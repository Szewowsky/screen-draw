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
  type ScreenDrawSettings,
} from "../services/settings-store.js";
import { broadcast } from "../services/events.js";
import { registerToggleShortcut } from "../services/shortcut.js";
import {
  getActiveDisplayId,
  isOverlayActive,
  setOverlayActive,
  setOverlayActiveDisplay,
} from "../windows/overlay-window.js";

export function registerOverlayHandlers(): void {
  ipcMain.handle("overlay:setActive", async (event, active: unknown) => {
    if (typeof active !== "boolean") {
      throw new Error("overlay:setActive expects a boolean");
    }
    await setOverlayActive(active, { sourceWindow: BrowserWindow.fromWebContents(event.sender) });
    return { active: isOverlayActive(), activeDisplayId: getActiveDisplayId() };
  });

  ipcMain.handle("overlay:getState", async () => {
    return { active: isOverlayActive(), activeDisplayId: getActiveDisplayId() };
  });

  ipcMain.handle("overlay:setActiveDisplay", async (_event, displayId: unknown) => {
    if (typeof displayId !== "number") {
      throw new Error("overlay:setActiveDisplay expects a display id");
    }
    await setOverlayActiveDisplay(displayId);
    return { active: isOverlayActive(), activeDisplayId: getActiveDisplayId() };
  });

  ipcMain.handle("settings:get", async (): Promise<ScreenDrawSettings> => {
    return getSettings();
  });

  ipcMain.handle(
    "settings:setShortcut",
    async (_event, shortcut: unknown): Promise<ScreenDrawSettings> => {
      if (typeof shortcut !== "string") {
        throw new Error("settings:setShortcut expects a string accelerator");
      }
      const next = setShortcut(shortcut);
      await registerToggleShortcut(next.shortcut);
      broadcast("settings:changed", next);
      return next;
    },
  );

  ipcMain.handle(
    "settings:setDefaults",
    async (_event, partial: unknown): Promise<ScreenDrawSettings> => {
      const input = (partial ?? {}) as { defaultColor?: unknown; defaultSize?: unknown };
      const next = setDefaults({
        defaultColor: typeof input.defaultColor === "string" ? input.defaultColor : undefined,
        defaultSize: typeof input.defaultSize === "number" ? input.defaultSize : undefined,
      });
      broadcast("settings:changed", next);
      return next;
    },
  );
}
