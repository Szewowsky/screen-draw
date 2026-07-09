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
import { exportAnnotatedScreenshot } from "../services/annotated-export.js";
import { registerLatencyProbeHandlers } from "../services/latency-probe.js";

import { app, ipcMain, nativeTheme } from "electron";
import { logger } from "../logger.js";
import { broadcast } from "../services/events.js";
import { setTheme } from "../services/settings-store.js";
import { isThemeSource, resolveEffectiveTheme, type ThemeSource } from "../services/theme.js";
import { getUpdateNotificationState, installDownloadedUpdate } from "../services/updater.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type OpenAtLoginState = {
  openAtLogin: boolean;
  available: boolean;
};

function getOpenAtLoginState(): OpenAtLoginState {
  if (!app.isPackaged) {
    logger.debug("app", "Launch at login unavailable: !app.isPackaged");
    return { openAtLogin: false, available: false };
  }

  return {
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    available: true,
  };
}

export function registerHandlers(): void {
  logger.info("handlers", "Registering IPC handlers...");

  // Register app handlers using ipcMain API
  ipcMain.handle("app:getInfo", async (_event) => {
    return await appHandlers.getInfo();
  });

  ipcMain.handle("app:getProjectPath", async () => {
    return path.join(__dirname, "..", "..");
  });

  ipcMain.handle("app:getOpenAtLogin", async () => {
    return getOpenAtLoginState();
  });

  ipcMain.handle("app:setOpenAtLogin", async (_event, openAtLogin: unknown) => {
    if (typeof openAtLogin !== "boolean") {
      throw new Error("app:setOpenAtLogin expects a boolean");
    }

    if (!app.isPackaged) {
      logger.info("app", "Launch at login setter ignored: !app.isPackaged");
      return getOpenAtLoginState();
    }

    app.setLoginItemSettings({ openAtLogin });
    return getOpenAtLoginState();
  });

  // Settings window handlers
  ipcMain.handle("window:openSettings", async (_event) => {
    await openSettingsWindow();
  });

  ipcMain.handle("window:closeSettings", async (_event) => {
    getSettingsWindow()?.close();
  });

  ipcMain.handle("nativeTheme:getInfo", async () => {
    const themeSource = nativeTheme.themeSource as ThemeSource;
    return {
      themeSource,
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      effectiveTheme: resolveEffectiveTheme(themeSource, nativeTheme.shouldUseDarkColors),
    };
  });

  ipcMain.handle("nativeTheme:setThemeSource", async (_event, source: unknown) => {
    if (!isThemeSource(source)) {
      throw new Error("nativeTheme:setThemeSource expects system, light, or dark");
    }

    const next = setTheme(source);
    nativeTheme.themeSource = source;
    broadcast("settings:changed", next);
    broadcast("nativeTheme:updated", {
      effectiveTheme: resolveEffectiveTheme(source, nativeTheme.shouldUseDarkColors),
    });
    return true;
  });

  ipcMain.handle("updater:getState", async () => getUpdateNotificationState());
  ipcMain.handle("updater:quitAndInstall", async () => installDownloadedUpdate());

  // Drawing overlay + settings handlers
  registerOverlayHandlers();
  // Toolbar window ⇄ overlay bridge
  registerToolbarHandlers();
  ipcMain.handle("export:annotatedScreenshot", async () => {
    return await exportAnnotatedScreenshot();
  });
  // Env-gated latency probe; registers nothing unless SCREEN_DRAW_LAT=1.
  registerLatencyProbeHandlers();

  logger.info("handlers", "✓ IPC handlers registered");

  // TODO: Add more handlers here using ipcMain.handle()
  // Example:
  // ipcMain.handle('file:read', async (event, path) => {
  //   const fs = await import('fs/promises');
  //   return await fs.readFile(path, 'utf-8');
  // });
}
