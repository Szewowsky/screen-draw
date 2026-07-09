import { isThemeSource, type ThemeSource } from "./theme.js";

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

export type ToolbarPositionScope = "shared" | "per-display";
export type ToolbarPositionByDisplay = Record<string, ToolbarPosition>;
export type { ThemeSource } from "./theme.js";

export interface CursorHighlightSettings {
  enabled: boolean;
  color: string;
  size: number;
  opacity: number;
}

export interface SpotlightSettings {
  enabled: boolean;
  radius: number;
  dimOpacity: number;
}

export interface EffectsShortcuts {
  highlight?: string;
  spotlight?: string;
}

export interface ScreenDrawSettings {
  /** App chrome appearance; system follows the current macOS appearance. */
  theme: ThemeSource;
  /** Global accelerator that toggles drawing mode, e.g. "Command+Shift+D". */
  shortcut: string;
  /** Default stroke color as a hex string. */
  defaultColor: string;
  /** Default stroke size in pixels. */
  defaultSize: number;
  /** Last dragged position of the floating toolbar; null = default placement. */
  toolbarPosition: ToolbarPosition | null;
  /** Whether toolbar position is shared across displays or remembered per display. */
  toolbarPositionScope: ToolbarPositionScope;
  /** Display-id keyed toolbar positions used when toolbarPositionScope is per-display. */
  toolbarPositionByDisplay: ToolbarPositionByDisplay;
  /** Recently picked custom colors, most recent first. */
  recentColors: string[];
  /** When true, the toolbar window is hidden from screen recordings (content protection). */
  hideToolbarInRecordings: boolean;
  /** Presenter cursor highlight effect settings. */
  cursorHighlight: CursorHighlightSettings;
  /** Presenter spotlight effect settings. */
  spotlight: SpotlightSettings;
  /** Optional presenter effect global shortcuts; empty strings mean disabled. */
  effectsShortcuts: EffectsShortcuts;
}

export const DEFAULT_SETTINGS: ScreenDrawSettings = {
  theme: "system",
  shortcut: "Command+Shift+D",
  defaultColor: "#FF3B30",
  defaultSize: 4,
  toolbarPosition: null,
  toolbarPositionScope: "shared",
  toolbarPositionByDisplay: {},
  recentColors: [],
  hideToolbarInRecordings: false,
  cursorHighlight: { enabled: false, color: "#FFD60A", size: 60, opacity: 0.35 },
  spotlight: { enabled: false, radius: 180, dimOpacity: 0.55 },
  effectsShortcuts: {},
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

function coerceToolbarPositionScope(raw: unknown): ToolbarPositionScope {
  return raw === "per-display" ? "per-display" : "shared";
}

function coerceThemeSource(raw: unknown): ThemeSource {
  return isThemeSource(raw) ? raw : "system";
}

function coerceToolbarPositionByDisplay(raw: unknown): ToolbarPositionByDisplay {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const positions: ToolbarPositionByDisplay = {};
  for (const [displayId, value] of Object.entries(raw)) {
    const position = coerceToolbarPosition(value);
    if (displayId.trim() && position) positions[displayId] = position;
  }
  return positions;
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

function coerceUnitInterval(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : fallback;
}

function coercePositiveNumber(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function coerceCursorHighlight(raw: unknown): CursorHighlightSettings {
  const value = (raw ?? {}) as Partial<Record<keyof CursorHighlightSettings, unknown>>;
  return {
    enabled: value.enabled === true,
    color:
      typeof value.color === "string" && HEX_COLOR.test(value.color)
        ? value.color
        : DEFAULT_SETTINGS.cursorHighlight.color,
    size: coercePositiveNumber(value.size, DEFAULT_SETTINGS.cursorHighlight.size),
    opacity: coerceUnitInterval(value.opacity, DEFAULT_SETTINGS.cursorHighlight.opacity),
  };
}

function coerceSpotlight(raw: unknown): SpotlightSettings {
  const value = (raw ?? {}) as Partial<Record<keyof SpotlightSettings, unknown>>;
  return {
    enabled: value.enabled === true,
    radius: coercePositiveNumber(value.radius, DEFAULT_SETTINGS.spotlight.radius),
    dimOpacity: coerceUnitInterval(value.dimOpacity, DEFAULT_SETTINGS.spotlight.dimOpacity),
  };
}

function coerceEffectsShortcuts(raw: unknown): EffectsShortcuts {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const value = raw as Partial<Record<keyof EffectsShortcuts, unknown>>;
  return {
    ...(typeof value.highlight === "string" && value.highlight.trim()
      ? { highlight: value.highlight.trim() }
      : {}),
    ...(typeof value.spotlight === "string" && value.spotlight.trim()
      ? { spotlight: value.spotlight.trim() }
      : {}),
  };
}

/** Turn raw (possibly legacy, partial, or corrupt) JSON into valid settings. */
export function coerceSettings(raw: unknown): ScreenDrawSettings {
  const value = (raw ?? {}) as Partial<Record<keyof ScreenDrawSettings, unknown>>;
  return {
    theme: coerceThemeSource(value.theme),
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
    toolbarPositionScope: coerceToolbarPositionScope(value.toolbarPositionScope),
    toolbarPositionByDisplay: coerceToolbarPositionByDisplay(value.toolbarPositionByDisplay),
    recentColors: coerceRecentColors(value.recentColors),
    hideToolbarInRecordings: value.hideToolbarInRecordings === true,
    cursorHighlight: coerceCursorHighlight(value.cursorHighlight),
    spotlight: coerceSpotlight(value.spotlight),
    effectsShortcuts: coerceEffectsShortcuts(value.effectsShortcuts),
  };
}

/** Prepend a picked color to the recent list (deduplicated, capped). */
export function addRecentColor(recent: readonly string[], color: string): string[] {
  if (!HEX_COLOR.test(color)) return [...recent];
  const rest = recent.filter((c) => c.toLowerCase() !== color.toLowerCase());
  return [color, ...rest].slice(0, RECENT_COLORS_LIMIT);
}
