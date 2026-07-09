import { app } from "electron";
import electronUpdater from "electron-updater";

import { logger } from "../logger.js";
import { broadcast } from "./events.js";
import {
  INITIAL_UPDATE_NOTIFICATION_STATE,
  reduceUpdateNotification,
  type UpdateNotificationEvent,
  type UpdateNotificationState,
} from "./update-state.js";

const INITIAL_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const { autoUpdater } = electronUpdater;

let state: UpdateNotificationState = INITIAL_UPDATE_NOTIFICATION_STATE;
let started = false;

function transition(event: UpdateNotificationEvent): void {
  state = reduceUpdateNotification(state, event);
  broadcast("updater:state-changed", state);
}

function checkForUpdates(): void {
  if (state.status === "downloaded") return;
  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    if (state.status !== "error") transition({ type: "error" });
    logger.debug(
      "updater",
      "Update check failed silently",
      error instanceof Error ? error.message : error,
    );
  });
}

export function getUpdateNotificationState(): UpdateNotificationState {
  return state;
}

export function installDownloadedUpdate(): boolean {
  if (state.status !== "downloaded") return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
}

export function startUpdater(): void {
  if (started) return;
  started = true;

  if (!app.isPackaged) {
    logger.info("updater", "Auto-update skipped: !app.isPackaged");
    return;
  }

  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => transition({ type: "checking" }));
  autoUpdater.on("update-available", (info) =>
    transition({ type: "available", version: info.version }),
  );
  autoUpdater.on("download-progress", () => transition({ type: "download-progress" }));
  autoUpdater.on("update-downloaded", (info) =>
    transition({ type: "downloaded", version: info.version }),
  );
  autoUpdater.on("update-not-available", () => transition({ type: "not-available" }));
  autoUpdater.on("update-cancelled", () => transition({ type: "error" }));
  autoUpdater.on("error", (error) => {
    transition({ type: "error" });
    logger.debug("updater", "Updater failed silently", error.message);
  });

  const initialCheck = setTimeout(checkForUpdates, INITIAL_CHECK_DELAY_MS);
  const recurringCheck = setInterval(checkForUpdates, CHECK_INTERVAL_MS);
  initialCheck.unref();
  recurringCheck.unref();
}
