export type AdoptableToolbarState = {
  tool:
    | "select"
    | "pen"
    | "highlighter"
    | "laser"
    | "eraser"
    | "text"
    | "line"
    | "arrow"
    | "rectangle"
    | "ellipse";
  color: string;
  size: number;
  vanishing?: boolean;
};

const ADOPTABLE_TOOLS = new Set<AdoptableToolbarState["tool"]>([
  "select",
  "pen",
  "highlighter",
  "laser",
  "eraser",
  "text",
  "line",
  "arrow",
  "rectangle",
  "ellipse",
]);

let cachedToolbarState: Record<string, unknown> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdoptableTool(value: unknown): value is AdoptableToolbarState["tool"] {
  return typeof value === "string" && ADOPTABLE_TOOLS.has(value as AdoptableToolbarState["tool"]);
}

export function pickAdoptableToolbarState(raw: unknown): AdoptableToolbarState | null {
  if (!isRecord(raw)) return null;
  if (!isAdoptableTool(raw.tool)) return null;
  if (typeof raw.color !== "string" || !raw.color.trim()) return null;
  if (typeof raw.size !== "number" || !Number.isFinite(raw.size) || raw.size <= 0) return null;
  return {
    tool: raw.tool,
    color: raw.color,
    size: raw.size,
    ...(typeof raw.vanishing === "boolean" ? { vanishing: raw.vanishing } : {}),
  };
}

export function cacheToolbarState(raw: unknown): Record<string, unknown> {
  cachedToolbarState = isRecord(raw) ? { ...raw } : {};
  return cachedToolbarState;
}

export function getCachedToolbarState(): Record<string, unknown> {
  return cachedToolbarState;
}

export function getAdoptableCachedToolbarState(): AdoptableToolbarState | null {
  return pickAdoptableToolbarState(cachedToolbarState);
}

export function getCachedToolbarVanishing(): boolean {
  return cachedToolbarState.vanishing === true;
}

export function setCachedToolbarVanishing(vanishing: boolean): Record<string, unknown> {
  cachedToolbarState = { ...cachedToolbarState, vanishing };
  return cachedToolbarState;
}
