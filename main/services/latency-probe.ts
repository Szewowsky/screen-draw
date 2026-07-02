import * as fs from "fs";
import * as path from "path";
import { performance } from "node:perf_hooks";

import { app, BrowserWindow, ipcMain } from "electron";

const TAG = "[LAT-161]";
const FINALIZE_TIMEOUT_MS = 1500;

type StageName =
  | "applyModeMs"
  | "syncOverlayWindowsMs"
  | "enterDrawingMs"
  | "overlaySetBoundsMs"
  | "overlayShowMs"
  | "overlayShowInactiveMs"
  | "overlayMoveTopMs"
  | "overlayFocusMs"
  | "showToolbarWindowMs"
  | "toolbarShowInactiveMs"
  | "toolbarMoveTopMs"
  | "toolbarSetBoundsMs"
  | "deferredFocusScheduledToFiredMs"
  | "appFocusCallMs"
  | "browserWindowFocusMs"
  | "rendererOverlayActiveToRaf1Ms"
  | "rendererOverlayActiveToRaf2Ms"
  | "rendererToolbarActiveToRaf1Ms"
  | "rendererToolbarActiveToRaf2Ms";

type Stages = Record<StageName, number | null>;

interface WindowOperation {
  scope: "overlay" | "toolbar";
  displayId: number | null;
  operation: "setBounds" | "show" | "showInactive" | "moveTop" | "focus";
  ms: number;
}

interface RendererMark {
  displayId: number | null;
  visibilityState: string;
  activeToRaf1Ms: number;
  activeToRaf2Ms: number;
}

interface ActivationSession {
  id: string;
  trigger: string;
  fromMode: string;
  toMode: string;
  activeDisplayId: number | null;
  startedAt: number;
  startedAtIso: string;
  stages: Stages;
  windowOperations: WindowOperation[];
  renderer: {
    overlay: RendererMark | null;
    toolbar: RendererMark | null;
  };
  focusWindow: string | null;
  finalized: boolean;
  finalizeTimer: ReturnType<typeof setTimeout> | null;
}

interface RendererMarkPayload {
  latencyActivationId?: unknown;
  source?: unknown;
  displayId?: unknown;
  visibilityState?: unknown;
  activeToRaf1Ms?: unknown;
  activeToRaf2Ms?: unknown;
}

const stageNames: StageName[] = [
  "applyModeMs",
  "syncOverlayWindowsMs",
  "enterDrawingMs",
  "overlaySetBoundsMs",
  "overlayShowMs",
  "overlayShowInactiveMs",
  "overlayMoveTopMs",
  "overlayFocusMs",
  "showToolbarWindowMs",
  "toolbarShowInactiveMs",
  "toolbarMoveTopMs",
  "toolbarSetBoundsMs",
  "deferredFocusScheduledToFiredMs",
  "appFocusCallMs",
  "browserWindowFocusMs",
  "rendererOverlayActiveToRaf1Ms",
  "rendererOverlayActiveToRaf2Ms",
  "rendererToolbarActiveToRaf1Ms",
  "rendererToolbarActiveToRaf2Ms",
];

let sequence = 0;
let current: ActivationSession | null = null;
let handlersRegistered = false;

export function isLatencyProbeEnabled(): boolean {
  return process.env.SCREEN_DRAW_LAT === "1";
}

function now(): number {
  return performance.now();
}

function round(ms: number): number {
  return Number(ms.toFixed(1));
}

function blankStages(): Stages {
  return Object.fromEntries(stageNames.map((name) => [name, null])) as Stages;
}

function windowLabel(win: BrowserWindow): string {
  const url = win.webContents.getURL();
  if (!url) return `window-${win.id}`;
  try {
    const parsed = new URL(url);
    const file = parsed.pathname.split("/").pop() || `window-${win.id}`;
    const displayId = parsed.searchParams.get("displayId");
    return displayId ? `${file}#${displayId}` : file;
  } catch {
    return `window-${win.id}`;
  }
}

function logPath(): string {
  return path.join(app.getPath("userData"), "latency.log");
}

function setStage(session: ActivationSession, stage: StageName, value: number): void {
  session.stages[stage] = round(value);
}

function addStageDuration(stage: StageName, durationMs: number): void {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return;
  const existing = current.stages[stage] ?? 0;
  current.stages[stage] = round(existing + durationMs);
  maybeFinalize();
}

function scheduleFinalize(session: ActivationSession): void {
  if (session.finalizeTimer !== null) clearTimeout(session.finalizeTimer);
  session.finalizeTimer = setTimeout(() => finalizeActivation("timeout"), FINALIZE_TIMEOUT_MS);
}

function maybeFinalize(): void {
  if (!current || current.finalized) return;
  if (
    current.renderer.overlay &&
    current.renderer.toolbar &&
    current.stages.deferredFocusScheduledToFiredMs !== null &&
    current.stages.appFocusCallMs !== null &&
    current.stages.browserWindowFocusMs !== null
  ) {
    finalizeActivation("complete");
  }
}

function finalizeActivation(reason: "complete" | "timeout" | "superseded"): void {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return;
  current.finalized = true;
  if (current.finalizeTimer !== null) {
    clearTimeout(current.finalizeTimer);
    current.finalizeTimer = null;
  }

  const payload = {
    tag: TAG,
    id: current.id,
    reason,
    trigger: current.trigger,
    fromMode: current.fromMode,
    toMode: current.toMode,
    activeDisplayId: current.activeDisplayId,
    startedAt: current.startedAtIso,
    totalMs: round(now() - current.startedAt),
    stages: current.stages,
    renderer: current.renderer,
    focusWindow: current.focusWindow,
    windowOperations: current.windowOperations,
  };
  const line = `${TAG} ${JSON.stringify(payload)}`;
  console.info(line);
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.appendFileSync(logPath(), `${line}\n`, "utf-8");
  current = null;
}

export function beginLatencyActivation(
  trigger: string,
  metadata: { fromMode: string; toMode: string },
): void {
  if (!isLatencyProbeEnabled()) return;
  finalizeActivation("superseded");
  sequence += 1;
  current = {
    id: `lat-${Date.now()}-${sequence}`,
    trigger,
    fromMode: metadata.fromMode,
    toMode: metadata.toMode,
    activeDisplayId: null,
    startedAt: now(),
    startedAtIso: new Date().toISOString(),
    stages: blankStages(),
    windowOperations: [],
    renderer: { overlay: null, toolbar: null },
    focusWindow: null,
    finalized: false,
    finalizeTimer: null,
  };
  scheduleFinalize(current);
}

export function updateLatencyActivation(metadata: { activeDisplayId?: number | null }): void {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return;
  if ("activeDisplayId" in metadata) current.activeDisplayId = metadata.activeDisplayId ?? null;
}

export function latencyActivationPayload(): {
  latencyProbe?: true;
  latencyActivationId?: string;
} {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return {};
  return { latencyProbe: true, latencyActivationId: current.id };
}

export function measureLatencyStage<T>(stage: StageName, action: () => T): T {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return action();
  const start = now();
  try {
    return action();
  } finally {
    addStageDuration(stage, now() - start);
  }
}

export async function measureLatencyStageAsync<T>(
  stage: StageName,
  action: () => Promise<T>,
): Promise<T> {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return await action();
  const start = now();
  try {
    return await action();
  } finally {
    addStageDuration(stage, now() - start);
  }
}

export function measureWindowOperation<T>(
  scope: "overlay" | "toolbar",
  displayId: number | null,
  operation: WindowOperation["operation"],
  stage: StageName,
  action: () => T,
): T {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return action();
  const start = now();
  try {
    return action();
  } finally {
    const ms = round(now() - start);
    current.windowOperations.push({ scope, displayId, operation, ms });
    addStageDuration(stage, ms);
  }
}

export function markDeferredFocusScheduled(): number | null {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return null;
  return now();
}

export function recordDeferredFocusFired(scheduledAt: number | null): void {
  if (!isLatencyProbeEnabled() || !current || current.finalized || scheduledAt === null) return;
  setStage(current, "deferredFocusScheduledToFiredMs", now() - scheduledAt);
  maybeFinalize();
}

export function recordBrowserWindowFocus(win: BrowserWindow): void {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return;
  if (current.stages.browserWindowFocusMs !== null) return;
  setStage(current, "browserWindowFocusMs", now() - current.startedAt);
  current.focusWindow = windowLabel(win);
  maybeFinalize();
}

export function recordRendererMark(raw: unknown): void {
  if (!isLatencyProbeEnabled() || !current || current.finalized) return;
  const payload = (raw ?? {}) as RendererMarkPayload;
  if (payload.latencyActivationId !== current.id) return;
  if (payload.source !== "overlay" && payload.source !== "toolbar") return;
  if (
    typeof payload.activeToRaf1Ms !== "number" ||
    typeof payload.activeToRaf2Ms !== "number"
  ) {
    return;
  }

  const mark: RendererMark = {
    displayId: typeof payload.displayId === "number" ? payload.displayId : null,
    visibilityState:
      typeof payload.visibilityState === "string" ? payload.visibilityState : "unknown",
    activeToRaf1Ms: round(payload.activeToRaf1Ms),
    activeToRaf2Ms: round(payload.activeToRaf2Ms),
  };

  if (payload.source === "overlay") {
    current.renderer.overlay = mark;
    setStage(current, "rendererOverlayActiveToRaf1Ms", mark.activeToRaf1Ms);
    setStage(current, "rendererOverlayActiveToRaf2Ms", mark.activeToRaf2Ms);
  } else {
    current.renderer.toolbar = mark;
    setStage(current, "rendererToolbarActiveToRaf1Ms", mark.activeToRaf1Ms);
    setStage(current, "rendererToolbarActiveToRaf2Ms", mark.activeToRaf2Ms);
  }

  maybeFinalize();
}

export function registerLatencyProbeHandlers(): void {
  if (!isLatencyProbeEnabled() || handlersRegistered) return;
  handlersRegistered = true;
  ipcMain.on("perf:mark", (_event, payload: unknown) => recordRendererMark(payload));
  app.on("browser-window-focus", (_event, win) => {
    recordBrowserWindowFocus(win);
  });
}
