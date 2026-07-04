import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SIZE,
  MIN_SIZE,
  OVERLAY_TOOLS,
  PALETTE,
  TOOL_KEYS,
  isPaletteColor,
  type BoardMode,
  type OverlayTool,
  type ScreenDrawSettings,
} from "./constants";
import {
  addText,
  arrowHeadPoints,
  beginDrag,
  canRedo as modelCanRedo,
  canUndo as modelCanUndo,
  cancelDrag,
  cancelErase,
  clearAll as modelClearAll,
  commitShape,
  createModel,
  DEFAULT_TEXT_MEASURE,
  beginErase,
  deleteSelected,
  discardCurrent,
  draggedShape,
  endDrag,
  endErase,
  eraseAt,
  extendFreehandPoints,
  getBounds,
  HIT_TOLERANCE,
  hitTest,
  redo as modelRedo,
  restyleSelected,
  selectShape,
  startShape,
  textFontPx,
  undo as modelUndo,
  updateDrag,
  updateShape,
  type DrawingModel,
  type MeasureText,
  type Point,
  type Shape,
} from "./drawing-model";
import { EPHEMERAL_HOLD_MS, ephemeralAlpha, pruneExpiredEphemerals } from "./ephemeral-ink";
import { freehandPathCommands, type FreehandPathCommand } from "./smooth-path";

interface OverlayWindowState {
  active?: boolean;
  sticky?: boolean;
  activeDisplayId?: number | null;
  latencyProbe?: boolean;
  latencyActivationId?: string;
}

interface AdoptToolStatePayload {
  activeDisplayId?: unknown;
  tool?: unknown;
  color?: unknown;
  size?: unknown;
  vanishing?: unknown;
}

interface SetVanishingPayload {
  activeDisplayId?: unknown;
  vanishing?: unknown;
}

/** Padding between a selected shape's bounds and the dashed indicator box. */
const SELECTION_PADDING = 4;

interface LaserShape extends Shape {
  tool: "pen";
  points: Point[];
}

interface LaserStroke {
  shape: LaserShape;
  endedAt: number | null;
  cachedCommands: readonly FreehandPathCommand[] | null;
  fadeTimer: number | null;
}

const ERASER_CURSOR_RADIUS = HIT_TOLERANCE;
const ERASER_CURSOR_SIZE = ERASER_CURSOR_RADIUS * 2;
const ERASER_CURSOR_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ERASER_CURSOR_SIZE}" height="${ERASER_CURSOR_SIZE}" viewBox="0 0 ${ERASER_CURSOR_SIZE} ${ERASER_CURSOR_SIZE}"><circle cx="${ERASER_CURSOR_RADIUS}" cy="${ERASER_CURSOR_RADIUS}" r="${ERASER_CURSOR_RADIUS - 0.75}" fill="none" stroke="white" stroke-width="1.5"/><circle cx="${ERASER_CURSOR_RADIUS}" cy="${ERASER_CURSOR_RADIUS}" r="${ERASER_CURSOR_RADIUS - 1.5}" fill="none" stroke="black" stroke-width="1"/></svg>`,
);
const ERASER_CURSOR = `url("data:image/svg+xml,${ERASER_CURSOR_SVG}") ${ERASER_CURSOR_RADIUS} ${ERASER_CURSOR_RADIUS}, auto`;
const TEXT_FONT_FAMILY = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BOARD_COLORS: Record<Exclude<BoardMode, "transparent">, string> = {
  white: "#FFFFFF",
  black: "#000000",
};

interface TextInputState {
  anchor: Point;
  color: string;
  size: number;
  value: string;
}

function textFont(fontPx: number): string {
  return `${fontPx}px ${TEXT_FONT_FAMILY}`;
}

function nextBoardMode(mode: BoardMode): BoardMode {
  if (mode === "transparent") return "white";
  if (mode === "white") return "black";
  return "transparent";
}

function isOverlayTool(value: unknown): value is OverlayTool {
  return typeof value === "string" && OVERLAY_TOOLS.has(value as OverlayTool);
}

function drawSelectionIndicator(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  measureText: MeasureText,
) {
  const bounds = getBounds(shape, measureText);
  if (!bounds) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#0A84FF";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(
    bounds.minX - SELECTION_PADDING,
    bounds.minY - SELECTION_PADDING,
    bounds.maxX - bounds.minX + SELECTION_PADDING * 2,
    bounds.maxY - bounds.minY + SELECTION_PADDING * 2,
  );
  ctx.restore();
}

function getOverlayDisplayId(): number | null {
  const value = new URLSearchParams(window.location.search).get("displayId");
  if (value === null) return null;
  const displayId = Number(value);
  return Number.isFinite(displayId) ? displayId : null;
}

function normalizeDisplayId(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function markLatencyActivation(params: OverlayWindowState, displayId: number | null): void {
  if (
    params.active !== true ||
    params.latencyProbe !== true ||
    typeof params.latencyActivationId !== "string" ||
    displayId === null ||
    params.activeDisplayId !== displayId
  ) {
    return;
  }

  const receivedAt = performance.now();
  const visibilityState = document.visibilityState;
  requestAnimationFrame(() => {
    const raf1At = performance.now();
    requestAnimationFrame(() => {
      const raf2At = performance.now();
      window.screenDraw.ipc.send("perf:mark", {
        latencyActivationId: params.latencyActivationId,
        source: "overlay",
        displayId,
        visibilityState,
        activeToRaf1Ms: raf1At - receivedAt,
        activeToRaf2Ms: raf2At - receivedAt,
      });
    });
  });
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const [left, right] = arrowHeadPoints(from, to, size);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(left.x, left.y);
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
}

function strokeFreehandPath(
  ctx: CanvasRenderingContext2D,
  commands: readonly FreehandPathCommand[],
) {
  ctx.beginPath();
  for (const command of commands) {
    if (command.type === "moveTo") {
      ctx.moveTo(command.point.x, command.point.y);
    } else if (command.type === "lineTo") {
      ctx.lineTo(command.point.x, command.point.y);
    } else {
      ctx.quadraticCurveTo(command.control.x, command.control.y, command.end.x, command.end.y);
    }
  }
  ctx.stroke();
}

/** Paint `shape` onto `ctx` at the tool's own opacity (0.35 for the highlighter). */
function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  options: {
    alpha?: number;
    cachedCommands?: readonly FreehandPathCommand[] | null;
    glow?: boolean;
  } = {},
) {
  const { points: pts } = shape;
  if (pts.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  if (options.glow) {
    ctx.shadowBlur = shape.size * 2 * (window.devicePixelRatio || 1);
    ctx.shadowColor = shape.color;
  }

  const alpha = options.alpha ?? 1;
  if (shape.tool === "highlighter") {
    ctx.globalAlpha = 0.35 * alpha;
    ctx.lineWidth = shape.size * 5;
  } else {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = shape.size;
  }

  if (shape.tool === "pen" || shape.tool === "highlighter") {
    strokeFreehandPath(ctx, options.cachedCommands ?? freehandPathCommands(pts));
  } else if (shape.tool === "text") {
    const text = shape.text ?? "";
    if (text.length > 0) {
      ctx.font = textFont(textFontPx(shape.size));
      ctx.textBaseline = "top";
      ctx.fillText(text, pts[0].x, pts[0].y);
    }
  } else {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (shape.tool === "line" || shape.tool === "arrow") {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (shape.tool === "arrow") {
        drawArrowHead(ctx, a, b, shape.size);
      }
    } else if (shape.tool === "rectangle") {
      ctx.beginPath();
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.stroke();
    } else if (shape.tool === "ellipse") {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function OverlayView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const modelRef = useRef<DrawingModel>(createModel());
  const drawingRef = useRef(false);
  const laserStrokesRef = useRef<LaserStroke[]>([]);
  const activeLaserStrokeRef = useRef<LaserStroke | null>(null);
  const textInputRef = useRef<TextInputState | null>(null);
  const textInputElementRef = useRef<HTMLInputElement | null>(null);
  const textInputOpenRef = useRef(false);
  const resolvedTextInputsRef = useRef<WeakSet<TextInputState>>(new WeakSet());
  const textMeasureCacheRef = useRef<Map<string, { width: number; height: number }>>(new Map());
  const boardModeRef = useRef<BoardMode>("transparent");
  // Whether this overlay is in interactive drawing mode. In sticky the windows
  // stay visible (and may still hold focus right after pinning), so the keydown
  // handler must early-out — otherwise `C`/`T`/⌘Z would act on the pinned ink.
  const activeRef = useRef(false);
  const displayIdRef = useRef(getOverlayDisplayId());

  const [tool, setTool] = useState<OverlayTool>("pen");
  const [color, setColor] = useState(PALETTE[0].value);
  const [size, setSize] = useState(4);
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  textInputRef.current = textInput;
  const textInputIsOpen = textInput !== null;
  const [boardMode, setBoardMode] = useState<BoardMode>("transparent");
  const [recentColors, setRecentColors] = useState<string[]>([]);
  // Style (color/size) of the currently selected shape, or null when nothing is
  // selected. Published to the toolbar so it mirrors the selection; kept
  // separate from the `color`/`size` new-stroke defaults, which selection edits
  // must not clobber. Derived from the model in `applyModel`.
  const [selectionStyle, setSelectionStyle] = useState<{ color: string; size: number } | null>(
    null,
  );
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    hasShapes: false,
  });
  const [activeDisplayId, setActiveDisplayId] = useState<number | null>(displayIdRef.current);
  const activeDisplayIdRef = useRef<number | null>(activeDisplayId);
  activeDisplayIdRef.current = activeDisplayId;

  // Session ink (`G`). Drawing behaves EXACTLY like normal drawing while this is
  // ON — strokes commit to the model and are selectable/restylable/undoable. The
  // toggle's only effect: on a FULL exit (see the active-changed listener) it
  // resets this overlay's model to a clean slate. State for publishing to the
  // toolbar; mirrored to a ref so the active-changed listener reads the live flag
  // without re-subscribing on every toggle. Sticky across re-activation.
  const [vanishing, setVanishing] = useState(false);
  const vanishingRef = useRef(vanishing);
  vanishingRef.current = vanishing;

  // Keep the latest tool settings available to the (stable) pointer handlers.
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;

  // Committed shapes are rasterized once into this offscreen layer and
  // re-rasterized only when the committed set changes (model revision) or the
  // canvas is resized. Per pointer event only the bitmap is blitted and the
  // in-progress shape painted on top.
  const committedLayerRef = useRef<{ canvas: HTMLCanvasElement; revision: number } | null>(null);

  // Pending animation-frame id for a scheduled repaint (null = none in flight).
  // Doubles as the coalescing flag and the cancel handle.
  const rafRef = useRef<number | null>(null);

  const measureTextForCanvas = useCallback<MeasureText>((text, fontPx) => {
    const key = `${fontPx}\0${text}`;
    const cached = textMeasureCacheRef.current.get(key);
    if (cached) return cached;
    const ctx = ctxRef.current;
    if (!ctx) return DEFAULT_TEXT_MEASURE(text, fontPx);
    ctx.save();
    ctx.font = textFont(fontPx);
    const measured = { width: ctx.measureText(text).width, height: fontPx };
    ctx.restore();
    textMeasureCacheRef.current.set(key, measured);
    return measured;
  }, []);

  const redraw = useCallback((): boolean => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return false;
    const model = modelRef.current;
    const now = performance.now();
    if (laserStrokesRef.current.length > 0) {
      laserStrokesRef.current = pruneExpiredEphemerals(laserStrokesRef.current, now);
    }
    let hasFadingLaserStroke = false;

    let layer = committedLayerRef.current;
    const stale =
      !layer ||
      layer.revision !== model.revision ||
      layer.canvas.width !== canvas.width ||
      layer.canvas.height !== canvas.height;
    if (stale) {
      const off = layer?.canvas ?? document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const offCtx = off.getContext("2d");
      if (!offCtx) return false;
      // Same device-pixel dimensions and DPR transform as the main canvas, so
      // the blit below is pixel-identical to painting the shapes directly.
      offCtx.clearRect(0, 0, off.width, off.height);
      const dpr = window.devicePixelRatio || 1;
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const shape of model.shapes) {
        drawShape(offCtx, shape);
      }
      layer = { canvas: off, revision: model.revision };
      committedLayerRef.current = layer;
    }
    if (!layer) return false;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const boardColor =
      boardModeRef.current === "transparent" ? null : BOARD_COLORS[boardModeRef.current];
    if (boardColor) {
      ctx.fillStyle = boardColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
    for (const stroke of laserStrokesRef.current) {
      const alpha = ephemeralAlpha(stroke, now);
      if (alpha > 0) {
        drawShape(ctx, stroke.shape, {
          alpha,
          cachedCommands: stroke.cachedCommands,
          glow: true,
        });
      }
      if (stroke.endedAt !== null && now - stroke.endedAt > EPHEMERAL_HOLD_MS && alpha > 0) {
        hasFadingLaserStroke = true;
      }
    }
    if (model.current) {
      drawShape(ctx, model.current);
    }
    // The shape being moved (and the selection indicator) render on top of the
    // cached committed layer.
    const selected =
      model.drag !== null
        ? draggedShape(model.drag)
        : model.selectedIndex !== null
          ? model.shapes[model.selectedIndex]
          : null;
    if (selected) {
      if (model.drag) drawShape(ctx, selected);
      drawSelectionIndicator(ctx, selected, measureTextForCanvas);
    }
    return hasFadingLaserStroke;
  }, [measureTextForCanvas]);

  // Coalesce several triggers in one frame (pointer drag + broadcast + toolbar
  // action) into a single clear+blit: set a pending frame if none is in flight,
  // and paint from the CURRENT modelRef when it fires (last state of the frame
  // wins). `redraw` captures no arguments, so the deferred paint always reflects
  // the latest `modelRef.current`.
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (redraw()) scheduleRedraw();
    });
  }, [redraw]);

  // Cancel a pending frame on unmount so the rAF callback never touches a
  // detached canvas. Own effect (not the canvas effect's cleanup, which fires on
  // every dep change) so it runs only on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      for (const stroke of laserStrokesRef.current) {
        if (stroke.fadeTimer !== null) window.clearTimeout(stroke.fadeTimer);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (textInputOpenRef.current) {
        void window.screenDraw.ipc.invoke("overlay:textInputOpen", false);
      }
    };
  }, []);

  /** Store the next model state, repaint, and sync the toolbar's enabled states. */
  const applyModel = useCallback(
    (next: DrawingModel) => {
      if (next === modelRef.current) return;
      modelRef.current = next;
      scheduleRedraw();
      // Mirror the selected shape's style to the toolbar (null when deselected).
      const selected = next.selectedIndex !== null ? next.shapes[next.selectedIndex] : null;
      setSelectionStyle((prev) => {
        if (!selected) return prev === null ? prev : null;
        return prev && prev.color === selected.color && prev.size === selected.size
          ? prev
          : { color: selected.color, size: selected.size };
      });
      setHistoryState((prev) => {
        const canUndo = modelCanUndo(next);
        const canRedo = modelCanRedo(next);
        const hasShapes = next.shapes.length > 0;
        return prev.canUndo === canUndo && prev.canRedo === canRedo && prev.hasShapes === hasShapes
          ? prev
          : { canUndo, canRedo, hasShapes };
      });
    },
    [scheduleRedraw],
  );

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxRef.current = ctx;
    redraw();
  }, [redraw]);

  const setTextInputOpen = useCallback((open: boolean) => {
    if (textInputOpenRef.current === open) return;
    textInputOpenRef.current = open;
    void window.screenDraw.ipc.invoke("overlay:textInputOpen", open);
  }, []);

  const focusTextInputElement = useCallback((element = textInputElementRef.current) => {
    element?.focus({ preventScroll: true });
  }, []);

  const setTextInputElement = useCallback(
    (element: HTMLInputElement | null) => {
      textInputElementRef.current = element;
      if (element) focusTextInputElement(element);
    },
    [focusTextInputElement],
  );

  useEffect(() => {
    if (!textInputIsOpen) return;
    const focusInput = () => focusTextInputElement();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [focusTextInputElement, textInputIsOpen]);

  useEffect(() => {
    setTextInputOpen(textInputIsOpen);
  }, [setTextInputOpen, textInputIsOpen]);

  const setBoardModeState = useCallback(
    (next: BoardMode) => {
      boardModeRef.current = next;
      setBoardMode(next);
      scheduleRedraw();
    },
    [scheduleRedraw],
  );

  const cancelTextInput = useCallback((state: TextInputState | null = textInputRef.current) => {
    if (!state || resolvedTextInputsRef.current.has(state)) return;
    resolvedTextInputsRef.current.add(state);
    if (textInputRef.current === state) setTextInput(null);
  }, []);

  const commitTextInput = useCallback(
    (state: TextInputState) => {
      if (resolvedTextInputsRef.current.has(state)) return;
      resolvedTextInputsRef.current.add(state);
      if (textInputRef.current === state) setTextInput(null);
      if (state.value.length === 0) return;
      applyModel(
        addText(
          modelRef.current,
          { color: state.color, size: state.size, text: state.value },
          state.anchor,
        ),
      );
    },
    [applyModel],
  );

  const resolveTextInput = useCallback(
    (state: TextInputState | null = textInputRef.current) => {
      const current = state;
      if (!current) return;
      if (current.value.length === 0) cancelTextInput(current);
      else commitTextInput(current);
    },
    [cancelTextInput, commitTextInput],
  );

  const changeTool = useCallback(
    (next: OverlayTool) => {
      resolveTextInput();
      setTool(next);
      // Selection only makes sense with the select tool active.
      if (next !== "select") {
        applyModel(selectShape(modelRef.current, null));
      }
    },
    [applyModel, resolveTextInput],
  );

  const undo = useCallback(() => {
    applyModel(modelUndo(modelRef.current));
  }, [applyModel]);

  const redo = useCallback(() => {
    applyModel(modelRedo(modelRef.current));
  }, [applyModel]);

  const clearAll = useCallback(() => {
    applyModel(modelClearAll(modelRef.current));
  }, [applyModel]);

  const cycleBoardMode = useCallback(() => {
    setBoardModeState(nextBoardMode(boardModeRef.current));
  }, [setBoardModeState]);

  const startLaserStroke = useCallback(
    (point: Point) => {
      const stroke: LaserStroke = {
        shape: {
          tool: "pen",
          color: colorRef.current,
          size: sizeRef.current,
          points: [point],
        },
        endedAt: null,
        cachedCommands: null,
        fadeTimer: null,
      };
      activeLaserStrokeRef.current = stroke;
      laserStrokesRef.current.push(stroke);
      drawingRef.current = true;
      scheduleRedraw();
    },
    [scheduleRedraw],
  );

  const updateLaserStroke = useCallback(
    (point: Point, shift: boolean) => {
      const stroke = activeLaserStrokeRef.current;
      if (!stroke) return;
      const points = stroke.shape.points;
      if (shift) {
        const nextPoints = extendFreehandPoints(points, point, true);
        if (nextPoints === null) return;
        stroke.shape = { ...stroke.shape, points: [...nextPoints] };
      } else {
        const last = points[points.length - 1];
        if (!last || extendFreehandPoints([last], point, false) === null) return;
        points.push(point);
      }
      stroke.cachedCommands = null;
      scheduleRedraw();
    },
    [scheduleRedraw],
  );

  const finishLaserStroke = useCallback(() => {
    const stroke = activeLaserStrokeRef.current;
    if (!stroke) return false;
    stroke.endedAt = performance.now();
    stroke.cachedCommands = freehandPathCommands(stroke.shape.points);
    stroke.fadeTimer = window.setTimeout(() => {
      stroke.fadeTimer = null;
      scheduleRedraw();
    }, EPHEMERAL_HOLD_MS);
    activeLaserStrokeRef.current = null;
    drawingRef.current = false;
    scheduleRedraw();
    return true;
  }, [scheduleRedraw]);

  const requestVanishingToggle = useCallback(() => {
    void window.screenDraw.ipc.invoke("overlay:toggleVanishing");
  }, []);

  const exit = useCallback(() => {
    void window.screenDraw.ipc.invoke("overlay:setActive", false);
  }, []);

  const isThisActiveDisplay = useCallback(() => {
    const displayId = displayIdRef.current;
    const activeId = activeDisplayIdRef.current;
    return displayId === null || activeId === null || displayId === activeId;
  }, []);

  const selectThisDisplay = useCallback(() => {
    const displayId = displayIdRef.current;
    if (displayId === null || activeDisplayIdRef.current === displayId) return;
    activeDisplayIdRef.current = displayId;
    setActiveDisplayId(displayId);
    void window.screenDraw.ipc.invoke("overlay:setActiveDisplay", displayId);
  }, []);

  // Load defaults and stay in sync with the control window.
  useEffect(() => {
    // Only follow default color/size when they actually change, so unrelated
    // settings updates (toolbar position, recent colors) don't reset the
    // locally picked tool options.
    let prev: ScreenDrawSettings | null = null;
    const applySettings = (next: ScreenDrawSettings) => {
      if (next?.defaultColor && next.defaultColor !== prev?.defaultColor) {
        setColor(next.defaultColor);
      }
      if (typeof next?.defaultSize === "number" && next.defaultSize !== prev?.defaultSize) {
        setSize(next.defaultSize);
      }
      setRecentColors(Array.isArray(next?.recentColors) ? next.recentColors : []);
      prev = next;
    };

    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const settings = await window.screenDraw.ipc.invoke<ScreenDrawSettings>("settings:get");
        applySettings(settings);
      } catch {
        // Fall back to component defaults.
      }
      unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
        applySettings(params as ScreenDrawSettings);
      });
    })();
    return () => unsub?.();
  }, []);

  const recordRecentColor = useCallback((value: string) => {
    if (isPaletteColor(value)) return;
    void window.screenDraw.ipc.invoke("settings:setDefaults", { recentColor: value });
  }, []);

  // Keep the toolbar and scoped shortcuts on whichever display was last clicked.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const state = await window.screenDraw.ipc.invoke<OverlayWindowState>("overlay:getState");
        activeRef.current = state.active === true;
        const nextDisplayId = normalizeDisplayId(state.activeDisplayId);
        activeDisplayIdRef.current = nextDisplayId;
        setActiveDisplayId(nextDisplayId);
      } catch {
        // Fall back to this window's display id from the URL.
      }
      unsub = window.screenDraw.ipc.on("overlay:active-display-changed", (params) => {
        const nextDisplayId = normalizeDisplayId(
          (params as OverlayWindowState | undefined)?.activeDisplayId,
        );
        activeDisplayIdRef.current = nextDisplayId;
        setActiveDisplayId(nextDisplayId);
      });
    })();
    return () => unsub?.();
  }, []);

  // Cancel any in-progress work and drop the selection so a dashed indicator or a
  // half-drawn stroke never floats over the user's normal work. Run on every
  // overlay (a selection can live on a non-active display). Committed shapes stay.
  const cancelInteraction = useCallback(() => {
    finishLaserStroke();
    drawingRef.current = false;
    applyModel(selectShape(cancelErase(cancelDrag(discardCurrent(modelRef.current))), null));
  }, [applyModel, finishLaserStroke]);

  // Follow the tri-state broadcast. Every exit (sticky or hidden) first resolves
  // text and cancels any active interaction. On a FULL exit (hidden: !active &&
  // !sticky) with session ink ON, this overlay then resets its model to a clean
  // slate — canvas and undo history wiped for the next session (session ink OFF
  // persists as always). PINNING (sticky) never wipes; it only leaves the overlay
  // click-through. `activeRef` gates the keydown handler so pinned overlays
  // ignore keys even while they briefly still hold focus. (The toolbar's
  // session-hidden reset now lives in main, which re-shows the toolbar window on
  // re-activation.)
  //
  // The listener is intentionally NOT gated on isThisActiveDisplay, so EVERY
  // display's overlay reacts. Each overlay decides the wipe from its OWN
  // `vanishingRef` (read via the ref so a `G` toggle never re-subscribes this
  // effect). In shared toolbar scope the main process sets that flag on every
  // overlay; in per-display scope it sets only the active display, preserving
  // the earlier one-display wipe semantics.
  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("overlay:active-changed", (params) => {
      const p = (params as OverlayWindowState | undefined) ?? {};
      markLatencyActivation(p, displayIdRef.current);
      activeRef.current = p.active === true;
      if (p.active) return;
      resolveTextInput();
      cancelInteraction();
      if (!p.sticky && vanishingRef.current) applyModel(createModel());
      if (!p.sticky) setBoardModeState("transparent");
    });
    return () => unsub?.();
  }, [applyModel, cancelInteraction, resolveTextInput, setBoardModeState]);

  // Publish this overlay's full toolbar-facing state to the toolbar window
  // (relayed via main) whenever it changes AND this display is active. The
  // active-display effect below re-publishes on becoming active, so the toolbar
  // reflects the newly-active overlay after a display switch.
  const publishState = useCallback(() => {
    if (!isThisActiveDisplay()) return;
    void window.screenDraw.ipc.invoke("toolbar:publishState", {
      tool,
      color,
      size,
      selectionStyle,
      recentColors,
      canUndo: historyState.canUndo,
      canRedo: historyState.canRedo,
      hasShapes: historyState.hasShapes,
      vanishing,
      boardMode,
    });
  }, [
    tool,
    color,
    size,
    selectionStyle,
    recentColors,
    historyState,
    vanishing,
    boardMode,
    isThisActiveDisplay,
  ]);

  useEffect(() => {
    publishState();
  }, [publishState]);

  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("overlay:adoptToolState", (params) => {
      const payload = (params ?? {}) as AdoptToolStatePayload;
      const targetDisplayId = normalizeDisplayId(payload.activeDisplayId);
      const displayId = displayIdRef.current;
      if (displayId !== null) {
        if (targetDisplayId !== displayId) return;
      } else if (!isThisActiveDisplay()) {
        return;
      }
      if (!isOverlayTool(payload.tool)) return;
      if (typeof payload.color !== "string" || !payload.color.trim()) return;
      if (typeof payload.size !== "number" || !Number.isFinite(payload.size) || payload.size <= 0) {
        return;
      }
      setTool(payload.tool);
      setColor(payload.color);
      setSize(payload.size);
      if (typeof payload.vanishing === "boolean") setVanishing(payload.vanishing);
    });
    return () => unsub();
  }, [isThisActiveDisplay]);

  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("overlay:setVanishing", (params) => {
      const payload = (params ?? {}) as SetVanishingPayload;
      if (typeof payload.vanishing !== "boolean") return;
      if ("activeDisplayId" in payload) {
        const targetDisplayId = normalizeDisplayId(payload.activeDisplayId);
        const displayId = displayIdRef.current;
        if (displayId !== null) {
          if (targetDisplayId !== displayId) return;
        } else if (!isThisActiveDisplay()) {
          return;
        }
      }
      setVanishing(payload.vanishing);
    });
    return () => unsub();
  }, [isThisActiveDisplay]);

  // Re-publish when this overlay becomes the active display (so the toolbar
  // shows this overlay's values, not the previously-active one's). Keyed on the
  // active display; publishState reads the latest state via its own closure.
  const publishStateRef = useRef(publishState);
  publishStateRef.current = publishState;
  useEffect(() => {
    if (isThisActiveDisplay()) publishStateRef.current();
  }, [activeDisplayId, isThisActiveDisplay]);

  // Undo/redo arrive as backend broadcasts because ⌘Z / ⌘⇧Z are registered as
  // global shortcuts while drawing (the Edit menu would otherwise swallow them).
  useEffect(() => {
    const offUndo = window.screenDraw.ipc.on("overlay:undo", () => {
      if (textInputOpenRef.current) return;
      if (isThisActiveDisplay()) undo();
    });
    const offRedo = window.screenDraw.ipc.on("overlay:redo", () => {
      if (textInputOpenRef.current) return;
      if (isThisActiveDisplay()) redo();
    });
    return () => {
      offUndo?.();
      offRedo?.();
    };
  }, [undo, redo, isThisActiveDisplay]);

  // Apply toolbar actions relayed from main. Only the active display's overlay
  // acts on them (the toolbar drives whichever display is active).
  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("toolbar:action", (params) => {
      if (!isThisActiveDisplay()) return;
      const action = params as { type?: string; [key: string]: unknown };
      switch (action.type) {
        case "setTool":
          if (typeof action.tool === "string") changeTool(action.tool as OverlayTool);
          break;
        case "setColor":
          if (typeof action.color === "string") {
            // With a shape selected, a color pick recolors it (a discrete pick,
            // so no coalescing) instead of changing the new-stroke default.
            if (modelRef.current.selectedIndex !== null) {
              applyModel(restyleSelected(modelRef.current, { color: action.color }));
            } else {
              setColor(action.color);
            }
          }
          break;
        case "recentColor":
          if (typeof action.color === "string") recordRecentColor(action.color);
          break;
        case "setSize":
          if (typeof action.size === "number") {
            // With a shape selected, the slider resizes it; coalesce the drag's
            // burst of ticks into one undo entry. Otherwise set the default.
            if (modelRef.current.selectedIndex !== null) {
              applyModel(
                restyleSelected(modelRef.current, { size: action.size }, { coalesce: true }),
              );
            } else {
              setSize(action.size);
            }
          }
          break;
        case "undo":
          undo();
          break;
        case "redo":
          redo();
          break;
        case "clear":
          clearAll();
          break;
        case "exit":
          exit();
          break;
        case "toggleVanishing":
          requestVanishingToggle();
          break;
        case "cycleBoardMode":
          cycleBoardMode();
          break;
      }
    });
    return () => unsub();
  }, [
    isThisActiveDisplay,
    applyModel,
    changeTool,
    recordRecentColor,
    undo,
    redo,
    clearAll,
    exit,
    requestVanishingToggle,
    cycleBoardMode,
  ]);

  // Canvas setup + pointer + keyboard handlers.
  useEffect(() => {
    setupCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toPoint = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      selectThisDisplay();
      const activeTool = toolRef.current;
      const p = toPoint(e);
      if (activeTool === "text") {
        e.preventDefault();
        drawingRef.current = false;
        resolveTextInput();
        applyModel(selectShape(modelRef.current, null));
        setTextInput({
          anchor: p,
          color: colorRef.current,
          size: sizeRef.current,
          value: "",
        });
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      if (activeTool === "select") {
        // Click selects the topmost hit shape (and arms a drag) or deselects.
        const model = modelRef.current;
        const index = hitTest(model.shapes, p, measureTextForCanvas);
        let next = selectShape(model, index);
        if (index !== null) next = beginDrag(next, p);
        applyModel(next);
        return;
      }
      if (activeTool === "laser") {
        applyModel(selectShape(modelRef.current, null));
        startLaserStroke(p);
        return;
      }
      if (activeTool === "eraser") {
        drawingRef.current = true;
        applyModel(eraseAt(beginErase(modelRef.current), p, measureTextForCanvas));
        return;
      }
      applyModel(
        startShape(
          modelRef.current,
          { tool: activeTool, color: colorRef.current, size: sizeRef.current },
          p,
        ),
      );
      drawingRef.current = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      // Hovering over a non-active display's overlay makes it the active display
      // (and focuses its window), so the first click is handled by a key window
      // instead of being swallowed. Only hover (no buttons pressed) may activate:
      // a captured drag on display A that physically crosses onto display B still
      // sends B raw pointermove events, and letting those hijack the active
      // display mid-stroke would move focus/toolbar and misdirect ⌘Z. The guard
      // in selectThisDisplay prevents redundant IPC when already active.
      if (e.buttons === 0) selectThisDisplay();
      const model = modelRef.current;
      if (activeLaserStrokeRef.current) {
        if (e.buttons !== 0) updateLaserStroke(toPoint(e), e.shiftKey);
        return;
      }
      if (model.drag) {
        applyModel(updateDrag(model, toPoint(e)));
        return;
      }
      if (model.eraseDrag) {
        applyModel(eraseAt(model, toPoint(e), measureTextForCanvas));
        return;
      }
      if (!drawingRef.current || !model.current) return;
      applyModel(updateShape(model, toPoint(e), e.shiftKey));
    };

    const onPointerUp = () => {
      if (finishLaserStroke()) return;
      const model = modelRef.current;
      if (model.drag) {
        applyModel(endDrag(model));
        return;
      }
      if (model.eraseDrag) {
        drawingRef.current = false;
        applyModel(endErase(model));
        return;
      }
      if (!drawingRef.current) return;
      drawingRef.current = false;
      applyModel(commitShape(model));
    };

    const onPointerCancel = () => {
      if (finishLaserStroke()) return;
      const model = modelRef.current;
      if (model.current) {
        drawingRef.current = false;
        applyModel(discardCurrent(model));
        return;
      }
      if (model.drag) {
        applyModel(cancelDrag(model));
        return;
      }
      if (model.eraseDrag) {
        drawingRef.current = false;
        applyModel(cancelErase(model));
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Only interactive drawing mode consumes keys. In sticky the overlay stays
      // visible (and may still hold focus just after pinning), but every key —
      // ⌘Z, C, T, Esc — must reach the app underneath instead of the pinned ink.
      if (!activeRef.current) return;
      // Never fire overlay shortcuts while typing in a text field — the
      // keystrokes belong to the input, including native ⌘Z/⌘⇧Z text editing.
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Escape cancels an in-progress move (shape snaps back), then drops
        // the selection; only a further press exits drawing mode.
        const model = modelRef.current;
        if (model.drag) {
          applyModel(selectShape(cancelDrag(model), null));
          return;
        }
        if (model.eraseDrag) {
          drawingRef.current = false;
          applyModel(cancelErase(model));
          return;
        }
        if (model.selectedIndex !== null) {
          applyModel(selectShape(model, null));
          return;
        }
        exit();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      // Plain single-key shortcuts (skip when a command/control/option modifier is held).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Backspace" || e.key === "Delete") {
        if (modelRef.current.selectedIndex !== null) {
          e.preventDefault();
          applyModel(deleteSelected(modelRef.current));
        }
        return;
      }

      const key = e.key.toLowerCase();

      // Shift+R toggles hiding the toolbar in recordings. Handled before the
      // tool-key lookup so it isn't seen as R (Rectangle). Persists through
      // settings; main re-applies content protection on the toolbar window. The
      // flip is atomic in main (no settings:get read-modify-write race here).
      if (key === "r" && e.shiftKey) {
        e.preventDefault();
        void window.screenDraw.ipc.invoke("settings:setDefaults", {
          toggleHideToolbarInRecordings: true,
        });
        return;
      }

      // T toggles the toolbar window for this session; Shift+T resets its
      // position to the default and clears the persisted one. Handled before the
      // tool-key lookup so Shift+T (which arrives as "T") isn't seen as R/plain.
      if (key === "t") {
        e.preventDefault();
        if (e.shiftKey) {
          void window.screenDraw.ipc.invoke("settings:setDefaults", { toolbarPosition: null });
        } else {
          void window.screenDraw.ipc.invoke("toolbar:action", { type: "toggleHidden" });
        }
        return;
      }

      // G toggles session ink.
      if (key === "g") {
        e.preventDefault();
        requestVanishingToggle();
        return;
      }

      // S pins the annotations (drawing → sticky). Same window-management path as
      // the toolbar's pin button; main runs the lifecycle and broadcasts back.
      if (key === "s") {
        e.preventDefault();
        void window.screenDraw.ipc.invoke("overlay:setSticky");
        return;
      }

      if (key === "w") {
        e.preventDefault();
        cycleBoardMode();
        return;
      }

      const toolForKey = TOOL_KEYS[key];
      if (toolForKey) {
        e.preventDefault();
        changeTool(toolForKey);
      } else if (key === "c") {
        e.preventDefault();
        clearAll();
      } else if (key === "[" || key === "]") {
        e.preventDefault();
        const delta = key === "]" ? 1 : -1;
        const model = modelRef.current;
        if (model.selectedIndex !== null) {
          // Resize the selected shape. A key repeat is a burst too, so coalesce.
          const current = model.shapes[model.selectedIndex].size;
          const nextSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, current + delta));
          applyModel(restyleSelected(model, { size: nextSize }, { coalesce: true }));
        } else {
          setSize((s) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, s + delta)));
        }
      } else if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        const swatch = PALETTE[Number(e.key) - 1];
        if (swatch) {
          // Recolor the selected shape (discrete pick), else set the default.
          if (modelRef.current.selectedIndex !== null) {
            applyModel(restyleSelected(modelRef.current, { color: swatch.value }));
          } else {
            setColor(swatch.value);
          }
        }
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("lostpointercapture", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", setupCanvas);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", setupCanvas);
    };
  }, [
    setupCanvas,
    applyModel,
    undo,
    redo,
    exit,
    clearAll,
    selectThisDisplay,
    changeTool,
    requestVanishingToggle,
    startLaserStroke,
    updateLaserStroke,
    finishLaserStroke,
    setTextInput,
    resolveTextInput,
    measureTextForCanvas,
    cycleBoardMode,
  ]);

  return (
    <div className="fixed inset-0 h-full w-full">
      <canvas
        ref={canvasRef}
        className={
          "absolute inset-0 " +
          (tool === "select" ? "cursor-default" : tool === "eraser" ? "" : "cursor-crosshair")
        }
        style={tool === "eraser" ? { cursor: ERASER_CURSOR } : undefined}
      />
      {textInput ? (
        <input
          ref={setTextInputElement}
          type="text"
          autoFocus
          value={textInput.value}
          spellCheck={false}
          autoComplete="off"
          aria-label="Annotation text"
          onChange={(e) => {
            setTextInput({ ...textInput, value: e.currentTarget.value });
          }}
          onBlur={() => resolveTextInput(textInput)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              commitTextInput(textInput);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancelTextInput(textInput);
            }
          }}
          className="absolute z-10 min-w-40 border-0 bg-transparent p-0 outline-none"
          style={{
            left: textInput.anchor.x,
            top: textInput.anchor.y,
            color: textInput.color,
            fontFamily: TEXT_FONT_FAMILY,
            fontSize: textFontPx(textInput.size),
            lineHeight: `${textFontPx(textInput.size)}px`,
            caretColor: textInput.color,
          }}
        />
      ) : null}
    </div>
  );
}
