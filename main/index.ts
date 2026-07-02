// Main process entry point for the standalone Electron app.

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";

import { registerHandlers } from "./handlers/index.js";
import { getPreloadPath, getWindowUrl } from "./windows/window-paths.js";
import { openSettingsWindow } from "./windows/settings-window.js";
import { createOverlayWindow, toggleOverlay } from "./windows/overlay-window.js";
import { getSettings } from "./services/settings-store.js";
import { registerToggleShortcut } from "./services/shortcut.js";
import { startLatencyTriggerWatcher } from "./services/latency-probe.js";
import { logger } from "./logger.js";

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── IPC Handlers ──────────────────────────────────────────────────────
// ipcMain is already wired to the IPC server by the runtime bootstrap.
registerHandlers();

// ── State ─────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

async function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  } else {
    await createMainWindow();
  }
}

// ── Window creation ───────────────────────────────────────────────────
async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug("main", "Main window already exists, skipping creation");
    return;
  }

  const packageJsonPath = path.join(__dirname, "..", "..", "package.json");

  const minWindowWidth = 400;
  const minWindowHeight = 560;
  const windowWidth = 460;
  const windowHeight = 640;
  let windowTitle = "Screen Draw";

  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf-8"));
      windowTitle = packageJson.productName || packageJson.appConfig?.displayName || windowTitle;
    }
  } catch {
    // Use defaults
  }

  // Create main window
  const browserWindowStartTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] Creating BrowserWindow", {
    timestamp: new Date().toISOString(),
  });

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: minWindowWidth,
    minHeight: minWindowHeight,
    title: windowTitle,
    backgroundColor: "#111111",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    show: false, // Don't show until WebView is ready (prevents flickering)
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const browserWindowEndTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] BrowserWindow constructor completed", {
    timestamp: new Date().toISOString(),
    duration_ms: browserWindowEndTime - browserWindowStartTime,
  });

  // Wait for ready-to-show event before showing window (prevents flickering)
  mainWindow.once("ready-to-show", () => {
    const showStartTime = Date.now();
    logger.info("main", "⏱️ [COLD_START] ready-to-show event received, showing window", {
      timestamp: new Date().toISOString(),
    });

    mainWindow?.show();
    app.focus({ steal: true });
    mainWindow?.focus();

    const showEndTime = Date.now();
    logger.info("main", "⏱️ [COLD_START] Window shown", {
      timestamp: new Date().toISOString(),
      duration_ms: showEndTime - showStartTime,
    });
  });

  // Determine URL to load (dev server preferred, fallback to build files)
  const url = await getWindowUrl("main-window.html");
  logger.info("main", "Resolved main window URL", { url });

  // Load URL - window will be shown automatically when ready-to-show fires
  const loadURLStartTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] Loading URL in window", {
    timestamp: new Date().toISOString(),
    url,
  });

  await mainWindow.loadURL(url);

  const loadURLEndTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] URL loaded in window (waiting for ready-to-show)", {
    timestamp: new Date().toISOString(),
    duration_ms: loadURLEndTime - loadURLStartTime,
  });
}

// ── Application menu ──────────────────────────────────────────────────
async function setupApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: "Screen Draw",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "Command+,",
          click: async () => await openSettingsWindow(),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
  Menu.setApplicationMenu(menu);
  logger.info("main", "Application menu configured with Settings");
}

// ── Menu bar tray ─────────────────────────────────────────────────────
function setupTray() {
  const iconPath = path.join(__dirname, "..", "..", "assets", "tray-iconTemplate.png");
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Screen Draw");

  const trayMenu = Menu.buildFromTemplate([
    {
      label: "Show Control Panel",
      click: () => {
        showMainWindow().catch((error) =>
          logger.error("main", "Failed to show main window from tray", error),
        );
      },
    },
    {
      label: "Toggle Drawing",
      click: () => {
        toggleOverlay({ triggerSource: "tray" }).catch((error) =>
          logger.error("main", "Failed to toggle overlay from tray", error),
        );
      },
    },
    { type: "separator" },
    {
      label: "Settings…",
      click: () => {
        openSettingsWindow().catch((error) =>
          logger.error("main", "Failed to open settings from tray", error),
        );
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(trayMenu);

  tray.on("click", () => {
    showMainWindow().catch((error) =>
      logger.error("main", "Failed to show main window from tray", error),
    );
  });

  logger.info("main", "Menu bar tray configured");
}

// ── Lifecycle events ──────────────────────────────────────────────────
app.on("window-all-closed", () => {
  // On macOS, apps typically don't quit when all windows are closed
  // Uncomment to quit on all windows closed:
  // app.quit();
});

app.on("activate", (hasVisibleWindows) => {
  logger.info("main", "App activate event received", {
    hasVisibleWindows,
    mainWindowExists: !!mainWindow,
    mainWindowDestroyed: mainWindow?.isDestroyed() ?? true,
  });

  // On macOS, re-create window when dock icon clicked if no windows
  if (!hasVisibleWindows) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      logger.info("main", "Creating main window due to activate event");
      createMainWindow();
    } else {
      logger.info("main", "Showing existing main window");
      mainWindow.show();
    }
  } else {
    logger.info("main", "Has visible windows, no action needed");
  }
});

app.on("before-quit", () => {
  logger.info("main", "App before-quit, cleaning up...");
});

// ── App ready ─────────────────────────────────────────────────────────
const startTime = Date.now();
logger.info("main", "⏱️ [COLD_START] Waiting for app ready...", {
  timestamp: new Date().toISOString(),
});

app.whenReady().then(async () => {
  const windowCreateStartTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] App ready, creating main window", {
    timestamp: new Date().toISOString(),
    wait_duration_ms: windowCreateStartTime - startTime,
  });

  app.setName("Screen Draw");
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
  startLatencyTriggerWatcher({
    toggle: () => toggleOverlay({ triggerSource: "lat-trigger" }),
    hideMain: () => {
      mainWindow?.hide();
    },
    quit: () => app.quit(),
  });

  await setupApplicationMenu();
  setupTray();

  // Create the drawing overlay (hidden) and register the activation shortcut.
  createOverlayWindow().catch((error) => {
    logger.error("main", "Failed to create overlay window", error);
  });
  registerToggleShortcut(getSettings().shortcut).catch((error) => {
    logger.error("main", "Failed to register toggle shortcut", error);
  });

  createMainWindow()
    .then(() => {
      const windowCreateEndTime = Date.now();
      logger.info("main", "⏱️ [COLD_START] Main window created successfully", {
        timestamp: new Date().toISOString(),
        duration_ms: windowCreateEndTime - windowCreateStartTime,
      });
    })
    .catch((error) => {
      logger.error("main", "Failed to create main window", error);
    });
});
