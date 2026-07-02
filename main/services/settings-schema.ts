/**
 * Pure settings schema for Screen Draw.
 *
 * Defaults, coercion of raw JSON into valid settings, and the recent-color
 * list transition — no Electron imports, so the module is unit testable in
 * plain Node. The settings store handles file I/O and delegates here.
 */

export interface ToolbarPosition {
  x: number;
  y: number;
}

export interface ScreenDrawSettings {
  /** Global accelerator that toggles drawing mode, e.g. "Command+Shift+D". */
  shortcut: string;
  /** Default stroke color as a hex string. */
  defaultColor: string;
  /** Default stroke size in pixels. */
  defaultSize: number;
  /** Last dragged position of the floating toolbar; null = default placement. */
  toolbarPosition: ToolbarPosition | null;
  /** Recently picked custom colors, most recent first. */
  recentColors: string[];
  /** When true, the toolbar window is hidden from screen recordings (content protection). */
  hideToolbarInRecordings: boolean;
}

export const DEFAULT_SETTINGS: ScreenDrawSettings = {
  shortcut: "Command+Shift+D",
  defaultColor: "#FF3B30",
  defaultSize: 4,
  toolbarPosition: null,
  recentColors: [],
  hideToolbarInRecordings: false,
};

/** Maximum number of remembered custom colors. */
export const RECENT_COLORS_LIMIT = 4;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function coerceToolbarPosition(raw: unknown): ToolbarPosition | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { x, y } = raw as Partial<Record<"x" | "y", unknown>>;
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  return { x, y };
}

function coerceRecentColors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const colors: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !HEX_COLOR.test(entry)) continue;
    if (colors.some((c) => c.toLowerCase() === entry.toLowerCase())) continue;
    colors.push(entry);
    if (colors.length === RECENT_COLORS_LIMIT) break;
  }
  return colors;
}

/** Turn raw (possibly legacy, partial, or corrupt) JSON into valid settings. */
export function coerceSettings(raw: unknown): ScreenDrawSettings {
  const value = (raw ?? {}) as Partial<Record<keyof ScreenDrawSettings, unknown>>;
  return {
    shortcut:
      typeof value.shortcut === "string" && value.shortcut.trim()
        ? value.shortcut
        : DEFAULT_SETTINGS.shortcut,
    defaultColor:
      typeof value.defaultColor === "string" && value.defaultColor.trim()
        ? value.defaultColor
        : DEFAULT_SETTINGS.defaultColor,
    defaultSize:
      typeof value.defaultSize === "number" &&
      Number.isFinite(value.defaultSize) &&
      value.defaultSize > 0
        ? value.defaultSize
        : DEFAULT_SETTINGS.defaultSize,
    toolbarPosition: coerceToolbarPosition(value.toolbarPosition),
    recentColors: coerceRecentColors(value.recentColors),
    hideToolbarInRecordings: value.hideToolbarInRecordings === true,
  };
}

/** Prepend a picked color to the recent list (deduplicated, capped). */
export function addRecentColor(recent: readonly string[], color: string): string[] {
  if (!HEX_COLOR.test(color)) return [...recent];
  const rest = recent.filter((c) => c.toLowerCase() !== color.toLowerCase());
  return [color, ...rest].slice(0, RECENT_COLORS_LIMIT);
}
