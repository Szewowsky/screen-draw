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

export interface ScreenDrawSettings {
  shortcut: string;
  defaultColor: string;
  defaultSize: number;
}
