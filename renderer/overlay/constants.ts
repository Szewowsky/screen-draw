import type { ThemeSource } from "../../main/services/theme";

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

/**
 * Curated high-contrast annotation colors for the overlay color popover's
 * preset grid. Kept separate from PALETTE (the six toolbar quick-swatches):
 * these are lowercase `#rrggbb` to match normalized picker output.
 */
export const COLOR_PRESETS: string[] = [
  "#ffffff",
  "#000000",
  "#8e8e93",
  "#ff3b30",
  "#ff2d55",
  "#ff9500",
  "#ffd60a",
  "#30d158",
  "#00c7be",
  "#64d2ff",
  "#0a84ff",
  "#5e5ce6",
  "#bf5af2",
  "#a2845e",
  "#ac8e68",
];

export const MIN_SIZE = 1;
export const MAX_SIZE = 24;

export const TOOL_REGISTRY = [
  { tool: "select", key: "V", adoptable: true },
  { tool: "pen", key: "P", adoptable: true },
  { tool: "highlighter", key: "H", adoptable: true },
  { tool: "laser", key: "F", adoptable: true },
  { tool: "eraser", key: "E", adoptable: true },
  { tool: "text", key: "X", adoptable: true },
  { tool: "line", key: "L", adoptable: true },
  { tool: "arrow", key: "A", adoptable: true },
  { tool: "rectangle", key: "R", adoptable: true },
  { tool: "ellipse", key: "O", adoptable: true },
] as const;

export type OverlayTool = (typeof TOOL_REGISTRY)[number]["tool"];
export type DrawTool = Exclude<OverlayTool, "select" | "laser" | "eraser">;
export type AdoptableTool = Extract<(typeof TOOL_REGISTRY)[number], { adoptable: true }>["tool"];

export const TOOL_KEYS: Record<string, OverlayTool> = Object.fromEntries(
  TOOL_REGISTRY.map((entry) => [entry.key.toLowerCase(), entry.tool]),
) as Record<string, OverlayTool>;

export const OVERLAY_TOOLS: ReadonlySet<OverlayTool> = new Set(
  TOOL_REGISTRY.map((entry) => entry.tool),
);

export const ADOPTABLE_TOOLS: ReadonlySet<AdoptableTool> = new Set(
  TOOL_REGISTRY.filter((entry) => entry.adoptable).map((entry) => entry.tool),
);

export type BoardMode = "transparent" | "white" | "black";

export interface ToolbarPosition {
  x: number;
  y: number;
}

export type ToolbarPositionScope = "shared" | "per-display";
export type ToolbarPositionByDisplay = Record<string, ToolbarPosition>;

export interface ScreenDrawSettings {
  theme: ThemeSource;
  shortcut: string;
  defaultColor: string;
  defaultSize: number;
  /** Last dragged position of the floating toolbar; null = default placement. */
  toolbarPosition: ToolbarPosition | null;
  /** Whether toolbar position is shared across displays or remembered per display. */
  toolbarPositionScope: ToolbarPositionScope;
  /** Display-id keyed toolbar positions used when toolbarPositionScope is per-display. */
  toolbarPositionByDisplay: ToolbarPositionByDisplay;
  /** Recently picked custom colors, most recent first. */
  recentColors: string[];
  /** When true, the toolbar window is hidden from screen recordings. */
  hideToolbarInRecordings: boolean;
  cursorHighlight: {
    enabled: boolean;
    color: string;
    size: number;
    opacity: number;
  };
  spotlight: {
    enabled: boolean;
    radius: number;
    dimOpacity: number;
  };
  effectsShortcuts: {
    highlight?: string;
    spotlight?: string;
  };
}

export interface ShortcutStatus {
  registeredAccelerator: string | null;
  failedAccelerator: string | null;
}

/** True when `color` is one of the built-in palette swatches. */
export function isPaletteColor(color: string): boolean {
  return PALETTE.some((c) => c.value.toLowerCase() === color.toLowerCase());
}
