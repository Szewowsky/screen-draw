/** Shared drawing constants used by the overlay surface and the control panel. */

export interface PaletteColor {
  name: string;
  value: string;
}

export const PALETTE: PaletteColor[] = [
  { name: "Red", value: "#FF3B30" },
  { name: "Orange", value: "#FF9500" },
  { name: "Yellow", value: "#FFD60A" },
  { name: "Green", value: "#30D158" },
  { name: "Blue", value: "#0A84FF" },
  { name: "Purple", value: "#BF5AF2" },
];

export const MIN_SIZE = 1;
export const MAX_SIZE = 24;

export type DrawTool = "pen" | "highlighter" | "line" | "arrow" | "rectangle" | "ellipse";

/** Tools available in the overlay toolbar: drawing tools plus the select tool. */
export type OverlayTool = DrawTool | "select";

export interface ToolbarPosition {
  x: number;
  y: number;
}

export interface ScreenDrawSettings {
  shortcut: string;
  defaultColor: string;
  defaultSize: number;
  /** Last dragged position of the floating toolbar; null = default placement. */
  toolbarPosition: ToolbarPosition | null;
  /** Recently picked custom colors, most recent first. */
  recentColors: string[];
}

export interface ShortcutStatus {
  registeredAccelerator: string | null;
  failedAccelerator: string | null;
}

/** True when `color` is one of the built-in palette swatches. */
export function isPaletteColor(color: string): boolean {
  return PALETTE.some((c) => c.value.toLowerCase() === color.toLowerCase());
}
