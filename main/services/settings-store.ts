/**
 * Settings store for Screen Draw.
 *
 * Persists the activation shortcut and default drawing tool preferences to a
 * small JSON file in the app's userData directory. The shortcut lives in the
 * backend because the global shortcut is registered here.
 */

import * as fs from "fs";
import * as path from "path";

import { app } from "electron";
import { logger } from "../logger.js";

export interface ScreenDrawSettings {
  /** Global accelerator that toggles drawing mode, e.g. "Command+Shift+D". */
  shortcut: string;
  /** Default stroke color as a hex string. */
  defaultColor: string;
  /** Default stroke size in pixels. */
  defaultSize: number;
}

const DEFAULT_SETTINGS: ScreenDrawSettings = {
  shortcut: "Command+Shift+D",
  defaultColor: "#FF3B30",
  defaultSize: 4,
};

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "screen-draw-settings.json");
}

let cached: ScreenDrawSettings | null = null;

function coerce(raw: unknown): ScreenDrawSettings {
  const value = (raw ?? {}) as Partial<Record<keyof ScreenDrawSettings, unknown>>;
  return {
    shortcut: typeof value.shortcut === "string" && value.shortcut.trim() ? value.shortcut : DEFAULT_SETTINGS.shortcut,
    defaultColor:
      typeof value.defaultColor === "string" && value.defaultColor.trim()
        ? value.defaultColor
        : DEFAULT_SETTINGS.defaultColor,
    defaultSize:
      typeof value.defaultSize === "number" && Number.isFinite(value.defaultSize) && value.defaultSize > 0
        ? value.defaultSize
        : DEFAULT_SETTINGS.defaultSize,
  };
}

export function getSettings(): ScreenDrawSettings {
  if (cached) {
    return cached;
  }

  try {
    const filePath = settingsFilePath();
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      cached = coerce(parsed);
    } else {
      cached = { ...DEFAULT_SETTINGS };
    }
  } catch (error) {
    logger.error("settings", "Failed to read settings, using defaults", error);
    cached = { ...DEFAULT_SETTINGS };
  }

  return cached;
}

function persist(next: ScreenDrawSettings): void {
  cached = next;
  try {
    fs.writeFileSync(settingsFilePath(), JSON.stringify(next, null, 2), "utf-8");
  } catch (error) {
    logger.error("settings", `Failed to write settings to ${settingsFilePath()}`, error);
  }
}

export function setShortcut(shortcut: string): ScreenDrawSettings {
  const trimmed = shortcut.trim();
  if (!trimmed) {
    throw new Error("Shortcut cannot be empty");
  }
  persist({ ...getSettings(), shortcut: trimmed });
  return getSettings();
}

export function setDefaults(partial: { defaultColor?: string; defaultSize?: number }): ScreenDrawSettings {
  const current = getSettings();
  persist(
    coerce({
      ...current,
      defaultColor: partial.defaultColor ?? current.defaultColor,
      defaultSize: partial.defaultSize ?? current.defaultSize,
    }),
  );
  return getSettings();
}
