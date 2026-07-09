import { BrowserWindow, nativeTheme } from "electron";
import { getPreloadPath, getWindowUrl } from "./window-paths.js";
import { logger } from "../logger.js";

let settingsWindow: BrowserWindow | null = null;

export async function openSettingsWindow(): Promise<void> {
  // If window exists and is not destroyed, just show it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    logger.debug("settings", "Settings window already exists, showing it");
    settingsWindow.show();
    return;
  }

  logger.info("settings", "Creating settings window");

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 300,
    minWidth: 400,
    minHeight: 200,
    title: "Settings",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#111111" : "#f2f2f7",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    center: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  const url = await getWindowUrl("settings-window.html");
  logger.info("settings", "Loading settings URL", { url });

  await settingsWindow.loadURL(url);
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
