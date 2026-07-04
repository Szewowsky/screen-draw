import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";

import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  nativeImage,
  Notification,
  systemPreferences,
} from "electron";

import { logger } from "../logger.js";
import {
  getActiveDisplay,
  getActiveOverlayWindow,
  getOverlayWindows,
  isOverlayActive,
  isOverlaySticky,
  withOverlayWindowsHiddenForCapture,
} from "../windows/overlay-window.js";
import { getToolbarWindow } from "../windows/toolbar-window.js";

interface ComposeResult {
  requestId?: unknown;
  pngDataUrl?: unknown;
  error?: unknown;
}

interface CapturePayload {
  requestId: string;
  screenshotDataUrl: string;
  display: { width: number; height: number };
}

export interface AnnotatedExportResult {
  filePath: string;
}

function exportFilePath(date = new Date()): string {
  const stamp = date.toISOString().replace(/T/, " ").replace(/\..+/, "").replace(/:/g, ".");
  return path.join(app.getPath("downloads"), `Screen Draw ${stamp}.png`);
}

function pngBufferFromDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/u.exec(dataUrl);
  if (!match) throw new Error("Overlay returned an invalid PNG data URL");
  return Buffer.from(match[1], "base64");
}

function notifyFailure(error: unknown): void {
  logger.error("export", "Failed to export annotated screenshot", error);
  if (!Notification.isSupported()) return;
  new Notification({
    title: "Screen Draw export failed",
    body: error instanceof Error ? error.message : "Could not save the annotated screenshot.",
  }).show();
}

/**
 * Actionable permission guidance, read AFTER a failed capture attempt — the
 * attempt itself is what registers the app in the Screen Recording list and
 * triggers the system prompt, so this must never gate the getSources call.
 */
function screenPermissionHint(): string {
  const status = systemPreferences.getMediaAccessStatus("screen");
  if (status === "granted") return "Capture failed despite granted Screen Recording permission.";
  return (
    "Enable Screen Draw under System Settings → Privacy & Security → Screen Recording, " +
    "then relaunch the app."
  );
}

async function captureActiveDisplay(): Promise<string> {
  const display = getActiveDisplay();
  if (!display) throw new Error("No active display to export");

  const thumbnailSize = {
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor),
  };
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
  });
  const source =
    sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
  if (!source) {
    throw new Error(`No screen capture source available. ${screenPermissionHint()}`);
  }
  if (source.thumbnail.isEmpty()) {
    throw new Error(`Screen capture returned an empty image. ${screenPermissionHint()}`);
  }
  return source.thumbnail.toDataURL();
}

async function withControlWindowsHiddenForCapture<T>(action: () => Promise<T>): Promise<T> {
  const overlayIds = new Set(getOverlayWindows().map((win) => win.id));
  const toolbarId = getToolbarWindow()?.id ?? null;
  const visibleWindows = BrowserWindow.getAllWindows().filter(
    (win) =>
      win.isVisible() && !overlayIds.has(win.id) && (toolbarId === null || win.id !== toolbarId),
  );
  for (const win of visibleWindows) {
    win.hide();
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  try {
    return await action();
  } finally {
    for (const win of visibleWindows) {
      if (!win.isDestroyed()) win.showInactive();
    }
  }
}

function composeInActiveOverlay(payload: CapturePayload): Promise<string> {
  const win = getActiveOverlayWindow();
  if (!win) throw new Error("No active overlay window to composite export");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while compositing annotated screenshot"));
    }, 5000);

    const cleanup = () => {
      clearTimeout(timeout);
      ipcMain.removeListener("export:composeResult", onResult);
    };

    const onResult = (event: Electron.IpcMainEvent, raw: unknown) => {
      if (event.sender !== win.webContents) return;
      const result = (raw ?? {}) as ComposeResult;
      if (result.requestId !== payload.requestId) return;
      cleanup();
      if (typeof result.error === "string") {
        reject(new Error(result.error));
        return;
      }
      if (typeof result.pngDataUrl !== "string") {
        reject(new Error("Overlay did not return a PNG"));
        return;
      }
      resolve(result.pngDataUrl);
    };

    ipcMain.on("export:composeResult", onResult);
    win.webContents.send("export:compose", payload);
  });
}

async function runAnnotatedExport(): Promise<AnnotatedExportResult> {
  if (!isOverlayActive() && !isOverlaySticky()) {
    throw new Error("Start drawing or pin annotations before exporting");
  }
  const display = getActiveDisplay();
  if (!display) throw new Error("No active display to export");

  const screenshotDataUrl = await withControlWindowsHiddenForCapture(() =>
    withOverlayWindowsHiddenForCapture(captureActiveDisplay),
  );
  const pngDataUrl = await composeInActiveOverlay({
    requestId: randomUUID(),
    screenshotDataUrl,
    display: {
      width: display.bounds.width,
      height: display.bounds.height,
    },
  });

  const png = pngBufferFromDataUrl(pngDataUrl);
  const filePath = exportFilePath();
  await fs.writeFile(filePath, png);
  clipboard.writeImage(nativeImage.createFromBuffer(png));
  logger.info("export", `Saved annotated screenshot to ${filePath}`);
  return { filePath };
}

export async function exportAnnotatedScreenshot(): Promise<AnnotatedExportResult> {
  try {
    return await runAnnotatedExport();
  } catch (error) {
    notifyFailure(error);
    throw error;
  }
}
