/**
 * Handler Registration
 *
 * Register all your IPC handlers here
 */

import * as path from "path";
import { fileURLToPath } from "url";

import { appHandlers } from "./app.js";
import { registerOverlayHandlers } from "./overlay.js";
import { registerToolbarHandlers } from "./toolbar.js";
import { getSettingsWindow, openSettingsWindow } from "../windows/settings-window.js";

import { ipcMain, nativeTheme } from "electron";
import { logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerHandlers(): void {
  logger.info("handlers", "Registering IPC handlers...");

  // Register app handlers using ipcMain API
  ipcMain.handle("app:getInfo", async (_event) => {
    return await appHandlers.getInfo();
  });

  ipcMain.handle("app:getProjectPath", async () => {
    return path.join(__dirname, "..", "..");
  });

  // Settings window handlers
  ipcMain.handle("window:openSettings", async (_event) => {
    await openSettingsWindow();
  });

  ipcMain.handle("window:closeSettings", async (_event) => {
    getSettingsWindow()?.close();
  });

  ipcMain.handle("nativeTheme:getInfo", async () => {
    return {
      themeSource: nativeTheme.themeSource,
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    };
  });

  ipcMain.handle("nativeTheme:setThemeSource", async (_event, source: unknown) => {
    if (source !== "system" && source !== "light" && source !== "dark") {
      throw new Error("nativeTheme:setThemeSource expects system, light, or dark");
    }

    nativeTheme.themeSource = source;
    return true;
  });

  // Drawing overlay + settings handlers
  registerOverlayHandlers();
  // Toolbar window ⇄ overlay bridge
  registerToolbarHandlers();

  logger.info("handlers", "✓ IPC handlers registered");

  // TODO: Add more handlers here using ipcMain.handle()
  // Example:
  // ipcMain.handle('file:read', async (event, path) => {
  //   const fs = await import('fs/promises');
  //   return await fs.readFile(path, 'utf-8');
  // });
}
