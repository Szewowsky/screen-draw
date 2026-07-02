import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  Button,
  SegmentedControl,
  SegmentedControlItem,
  Separator,
  Slider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Ghost,
  GripVertical,
  Highlighter,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Undo2,
  X,
} from "lucide-react";
import {
  COLOR_PRESETS,
  MAX_SIZE,
  MIN_SIZE,
  PALETTE,
  isPaletteColor,
  type OverlayTool,
  type ScreenDrawSettings,
  type ToolbarPosition,
} from "./constants";
import { normalizeHexColor } from "./color";
import { clampToolbarPosition, sanitizeToolbarPosition } from "./toolbar-prefs";
import {
  arrowHeadPoints,
  beginDrag,
  canRedo as modelCanRedo,
  canUndo as modelCanUndo,
  cancelDrag,
  clearAll as modelClearAll,
  commitShape,
  createModel,
  deleteSelected,
  discardCurrent,
  draggedShape,
  endDrag,
  getBounds,
  hitTest,
  redo as modelRedo,
  selectShape,
  startShape,
  undo as modelUndo,
  updateDrag,
  updateShape,
  type DrawingModel,
  type Point,
  type Shape,
} from "./drawing-model";
import { addEphemeral, ephemeralAlpha, pruneEphemerals, type Ephemeral } from "./ephemeral";

interface OverlayWindowState {
  activeDisplayId?: number | null;
}

const TOOLS: { tool: OverlayTool; label: string; key: string; Icon: typeof Pencil }[] = [
  { tool: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { tool: "pen", label: "Pen", key: "P", Icon: Pencil },
  { tool: "highlighter", label: "Highlighter", key: "H", Icon: Highlighter },
  { tool: "line", label: "Line", key: "L", Icon: Minus },
  { tool: "arrow", label: "Arrow", key: "A", Icon: ArrowUpRight },
  { tool: "rectangle", label: "Rectangle", key: "R", Icon: Square },
  { tool: "ellipse", label: "Ellipse", key: "O", Icon: Circle },
];

/** Padding between a selected shape's bounds and the dashed indicator box. */
const SELECTION_PADDING = 4;

function drawSelectionIndicator(ctx: CanvasRenderingContext2D, shape: Shape) {
  const bounds = getBounds(shape);
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

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const [left, right] = arrowHeadPoints(from, to, size);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(left.x, left.y);
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
}

/**
 * Paint `shape` onto `ctx`. `alphaScale` (default 1) multiplies the tool's own
 * opacity, so a fading ephemeral dims correctly for both the highlighter's 0.35
 * band and the fully opaque tools.
 */
function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, alphaScale = 1) {
  const { points: pts } = shape;
  if (pts.length === 0) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;

  if (shape.tool === "highlighter") {
    ctx.globalAlpha = 0.35 * alphaScale;
    ctx.lineWidth = shape.size * 5;
  } else {
    ctx.globalAlpha = alphaScale;
    ctx.lineWidth = shape.size;
  }

  if (shape.tool === "pen" || shape.tool === "highlighter") {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (pts.length === 1) {
      // Single tap: render a dot.
      ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    }
    ctx.stroke();
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

  ctx.globalAlpha = 1;
}

export function OverlayView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const modelRef = useRef<DrawingModel>(createModel());
  const drawingRef = useRef(false);
  const displayIdRef = useRef(getOverlayDisplayId());

  const [tool, setTool] = useState<OverlayTool>("pen");
  const [color, setColor] = useState(PALETTE[0].value);
  const [size, setSize] = useState(4);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [toolbarPos, setToolbarPos] = useState<ToolbarPosition | null>(null);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    hasShapes: false,
  });
  const [activeDisplayId, setActiveDisplayId] = useState<number | null>(displayIdRef.current);
  const activeDisplayIdRef = useRef<number | null>(activeDisplayId);
  activeDisplayIdRef.current = activeDisplayId;

  // Whether the in-overlay color popover is open. Mirrored to a ref so the
  // window-level keydown handler can let Escape close it before touching the
  // selection/drawing state (the handler runs in bubble phase, so it must
  // check this signal itself rather than rely on stopPropagation).
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;

  // Session-only toolbar visibility toggled by `T`. Not persisted: re-entering
  // drawing mode always shows the toolbar again (reset by the active-changed
  // effect below). Only gates the FloatingToolbar's rendering — drawing and
  // keyboard shortcuts keep working while the toolbar is hidden.
  const [hidden, setHidden] = useState(false);

  // Vanishing ink (`G`). While ON, a finished stroke is not committed to the
  // model/history — it joins the ephemeral list and fades out on its own. State
  // for the toolbar's active styling; mirrored to a ref for the once-bound
  // pointer handler. Sticky across re-activation (unlike `hidden`).
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

  // Finished ephemeral shapes, held in a ref (never state) so the stable
  // `redraw` and the long-lived rAF tick always read the live list. A single
  // rAF loop (tracked in `rafRef`) runs only while the list is non-empty.
  const ephemeralsRef = useRef<readonly Ephemeral[]>([]);
  const rafRef = useRef<number | null>(null);

  // Committed shapes are rasterized once into this offscreen layer and
  // re-rasterized only when the committed set changes (model revision) or the
  // canvas is resized. Per pointer event only the bitmap is blitted and the
  // in-progress shape painted on top.
  const committedLayerRef = useRef<{ canvas: HTMLCanvasElement; revision: number } | null>(null);

  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const model = modelRef.current;

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
      if (!offCtx) return;
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
    if (!layer) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
    // Vanishing-ink shapes render on top of the committed layer, dimming with
    // age. Paint (never prune) here: an expired one draws at alpha 0 until the
    // rAF tick removes it.
    const ephemerals = ephemeralsRef.current;
    if (ephemerals.length > 0) {
      const now = performance.now();
      for (const e of ephemerals) {
        drawShape(ctx, e.shape, ephemeralAlpha(now - e.createdAt));
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
      drawSelectionIndicator(ctx, selected);
    }
  }, []);

  /** Store the next model state, repaint, and sync the toolbar's enabled states. */
  const applyModel = useCallback(
    (next: DrawingModel) => {
      modelRef.current = next;
      redraw();
      setHistoryState((prev) => {
        const canUndo = modelCanUndo(next);
        const canRedo = modelCanRedo(next);
        const hasShapes = next.shapes.length > 0;
        return prev.canUndo === canUndo && prev.canRedo === canRedo && prev.hasShapes === hasShapes
          ? prev
          : { canUndo, canRedo, hasShapes };
      });
    },
    [redraw],
  );

  // Cancel the fade loop and forget any in-flight ephemerals. Used when clearing
  // and when drawing mode deactivates — never on a plain vanishing-ink toggle.
  // Repaints so a still-opaque ephemeral doesn't linger on the retained bitmap
  // (the deactivate path has no other redraw; the clear path repaints anyway).
  const clearEphemerals = useCallback(() => {
    ephemeralsRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    redraw();
  }, [redraw]);

  // Drive the fade: prune expired ephemerals, repaint, and keep animating only
  // while any remain. No-ops if a loop is already running (single loop).
  const startEphemeralLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      ephemeralsRef.current = pruneEphemerals(ephemeralsRef.current, performance.now());
      redraw();
      rafRef.current = ephemeralsRef.current.length > 0 ? requestAnimationFrame(tick) : null;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [redraw]);

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

  const changeTool = useCallback(
    (next: OverlayTool) => {
      setTool(next);
      // Selection only makes sense with the select tool active.
      if (next !== "select") {
        applyModel(selectShape(modelRef.current, null));
      }
    },
    [applyModel],
  );

  const undo = useCallback(() => {
    applyModel(modelUndo(modelRef.current));
  }, [applyModel]);

  const redo = useCallback(() => {
    applyModel(modelRedo(modelRef.current));
  }, [applyModel]);

  const clearAll = useCallback(() => {
    // Clear means clear: committed shapes and any fading vanishing ink both go.
    clearEphemerals();
    applyModel(modelClearAll(modelRef.current));
  }, [applyModel, clearEphemerals]);

  const toggleVanishing = useCallback(() => {
    // Toggling only flips the mode; in-flight ephemerals keep fading either way.
    setVanishing((v) => !v);
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
      setToolbarPos(
        sanitizeToolbarPosition(next?.toolbarPosition, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
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

  const moveToolbar = useCallback((pos: ToolbarPosition) => {
    setToolbarPos(
      clampToolbarPosition(pos, { width: window.innerWidth, height: window.innerHeight }),
    );
  }, []);

  const commitToolbarPos = useCallback((pos: ToolbarPosition) => {
    const clamped = clampToolbarPosition(pos, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    setToolbarPos(clamped);
    void window.screenDraw.ipc.invoke("settings:setDefaults", { toolbarPosition: clamped });
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

  // Re-entering drawing mode always reveals the toolbar again: the `T` toggle is
  // session-only. The overlay stays mounted while drawing is off (main hides the
  // windows), so reset off the backend's active broadcast rather than remount.
  // Deactivating also drops any in-flight vanishing ink from the prior session.
  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("overlay:active-changed", (params) => {
      if ((params as { active?: boolean } | undefined)?.active) setHidden(false);
      else clearEphemerals();
    });
    return () => unsub?.();
  }, [clearEphemerals]);

  // Undo/redo arrive as backend broadcasts because ⌘Z / ⌘⇧Z are registered as
  // global shortcuts while drawing (the Edit menu would otherwise swallow them).
  useEffect(() => {
    const offUndo = window.screenDraw.ipc.on("overlay:undo", () => {
      if (isThisActiveDisplay()) undo();
    });
    const offRedo = window.screenDraw.ipc.on("overlay:redo", () => {
      if (isThisActiveDisplay()) redo();
    });
    return () => {
      offUndo?.();
      offRedo?.();
    };
  }, [undo, redo, isThisActiveDisplay]);

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
      canvas.setPointerCapture(e.pointerId);
      const activeTool = toolRef.current;
      const p = toPoint(e);
      if (activeTool === "select") {
        // Click selects the topmost hit shape (and arms a drag) or deselects.
        const model = modelRef.current;
        const index = hitTest(model.shapes, p);
        let next = selectShape(model, index);
        if (index !== null) next = beginDrag(next, p);
        applyModel(next);
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
      // instead of being swallowed. The guard in selectThisDisplay prevents
      // redundant IPC when this display is already active.
      selectThisDisplay();
      const model = modelRef.current;
      if (model.drag) {
        applyModel(updateDrag(model, toPoint(e)));
        return;
      }
      if (!drawingRef.current || !model.current) return;
      applyModel(updateShape(model, toPoint(e), e.shiftKey));
    };

    const onPointerUp = () => {
      const model = modelRef.current;
      if (model.drag) {
        applyModel(endDrag(model));
        return;
      }
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (vanishingRef.current && model.current) {
        // Vanishing ink: the finished shape never enters the model/history — it
        // becomes an ephemeral that fades and is pruned by the rAF loop.
        ephemeralsRef.current = addEphemeral(
          ephemeralsRef.current,
          model.current,
          performance.now(),
        );
        applyModel(discardCurrent(model));
        startEphemeralLoop();
        return;
      }
      applyModel(commitShape(model));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // The color popover owns Escape while open: close it without touching
        // the selection or leaving drawing mode.
        if (pickerOpenRef.current) {
          e.preventDefault();
          setPickerOpen(false);
          return;
        }
        e.preventDefault();
        // Escape cancels an in-progress move (shape snaps back), then drops
        // the selection; only a further press exits drawing mode.
        const model = modelRef.current;
        if (model.drag) {
          applyModel(selectShape(cancelDrag(model), null));
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

      // Never fire tool shortcuts while typing in a text field (e.g. the color
      // popover's hex input) — the keystrokes belong to the input.
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        if (modelRef.current.selectedIndex !== null) {
          e.preventDefault();
          applyModel(deleteSelected(modelRef.current));
        }
        return;
      }

      const key = e.key.toLowerCase();
      // T toggles the toolbar for this session; Shift+T resets its position to
      // the default and clears the persisted one. Handled before the tool-key
      // lookup so Shift+T (which arrives as "T") isn't seen as a plain shortcut.
      // Ignored while the color popover is open so the toolbar doesn't shift out
      // from under the still-anchored popover.
      if (key === "t") {
        if (pickerOpenRef.current) return;
        e.preventDefault();
        if (e.shiftKey) {
          setToolbarPos(null);
          void window.screenDraw.ipc.invoke("settings:setDefaults", { toolbarPosition: null });
        } else {
          setHidden((h) => !h);
        }
        return;
      }

      // G toggles vanishing ink. Ignored while the color popover is open, for
      // consistency with T.
      if (key === "g") {
        if (pickerOpenRef.current) return;
        e.preventDefault();
        toggleVanishing();
        return;
      }

      const toolForKey = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (toolForKey) {
        e.preventDefault();
        changeTool(toolForKey.tool);
      } else if (key === "c") {
        e.preventDefault();
        clearAll();
      } else if (key === "[" || key === "]") {
        e.preventDefault();
        const delta = key === "]" ? 1 : -1;
        setSize((s) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, s + delta)));
      } else if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        const swatch = PALETTE[Number(e.key) - 1];
        if (swatch) setColor(swatch.value);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", setupCanvas);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", setupCanvas);
      // Stop the fade loop so it can't outlive the component.
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
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
    startEphemeralLoop,
    toggleVanishing,
  ]);

  const showToolbar =
    !hidden &&
    (displayIdRef.current === null ||
      activeDisplayId === null ||
      displayIdRef.current === activeDisplayId);

  return (
    <div className="fixed inset-0 h-full w-full">
      <canvas
        ref={canvasRef}
        className={
          "absolute inset-0 " + (tool === "select" ? "cursor-default" : "cursor-crosshair")
        }
      />
      {showToolbar ? (
        <FloatingToolbar
          tool={tool}
          onToolChange={changeTool}
          color={color}
          onColorChange={setColor}
          onColorCommit={recordRecentColor}
          recentColors={recentColors}
          pickerOpen={pickerOpen}
          onPickerOpenChange={setPickerOpen}
          size={size}
          onSizeChange={setSize}
          vanishing={vanishing}
          onVanishingToggle={toggleVanishing}
          pos={toolbarPos}
          onPosChange={moveToolbar}
          onPosCommit={commitToolbarPos}
          canUndo={historyState.canUndo}
          onUndo={undo}
          canRedo={historyState.canRedo}
          onRedo={redo}
          canClear={historyState.hasShapes}
          onClear={clearAll}
          onExit={exit}
        />
      ) : null}
    </div>
  );
}

interface FloatingToolbarProps {
  tool: OverlayTool;
  onToolChange: (tool: OverlayTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  onColorCommit: (color: string) => void;
  recentColors: string[];
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  size: number;
  onSizeChange: (size: number) => void;
  vanishing: boolean;
  onVanishingToggle: () => void;
  pos: ToolbarPosition | null;
  onPosChange: (pos: ToolbarPosition) => void;
  onPosCommit: (pos: ToolbarPosition) => void;
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  canClear: boolean;
  onClear: () => void;
  onExit: () => void;
}

function FloatingToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  onColorCommit,
  recentColors,
  pickerOpen,
  onPickerOpenChange,
  size,
  onSizeChange,
  vanishing,
  onVanishingToggle,
  pos,
  onPosChange,
  onPosCommit,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  canClear,
  onClear,
  onExit,
}: FloatingToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const lastDragPos = useRef<ToolbarPosition | null>(null);

  const onGripDown = (e: ReactPointerEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (ev: PointerEvent) => {
      if (!dragOffset.current) return;
      const next = { x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y };
      lastDragPos.current = next;
      onPosChange(next);
    };
    const onUp = () => {
      dragOffset.current = null;
      if (lastDragPos.current) {
        onPosCommit(lastDragPos.current);
        lastDragPos.current = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const customColors = recentColors.filter((c) => !isPaletteColor(c));

  const swatchRef = useRef<HTMLButtonElement>(null);

  const applyColor = useCallback(
    (value: string) => {
      onColorChange(value);
      onColorCommit(value);
      onPickerOpenChange(false);
    },
    [onColorChange, onColorCommit, onPickerOpenChange],
  );

  return (
    <div
      ref={barRef}
      className={
        "fixed z-30 flex h-9 items-center gap-0.5 rounded-[12px] border border-white/10 bg-[#1d1d1f]/95 px-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl" +
        (pos ? "" : " bottom-[88px] left-1/2 -translate-x-1/2")
      }
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Move toolbar"
            onPointerDown={onGripDown}
            className="flex h-6 w-4 cursor-grab items-center justify-center text-tertiary active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Drag to move</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <SegmentedControl
        type="single"
        size="small"
        value={tool}
        className="!rounded-[11px] !p-1"
        onValueChange={(value) => {
          if (typeof value === "string" && value) onToolChange(value as OverlayTool);
        }}
        aria-label="Drawing tool"
      >
        {TOOLS.map(({ tool: t, label, key, Icon }) => (
          <Tooltip key={t}>
            <TooltipTrigger asChild>
              <SegmentedControlItem
                value={t}
                iconOnly
                className="!size-6 !rounded-md"
                aria-label={label}
              >
                <Icon className="size-3.5" />
              </SegmentedControlItem>
            </TooltipTrigger>
            <TooltipContent shortcut={[key]}>{label}</TooltipContent>
          </Tooltip>
        ))}
      </SegmentedControl>

      <Separator orientation="vertical" />

      <SegmentedControl
        type="single"
        size="small"
        value={color}
        className="!rounded-[11px] !p-1"
        onValueChange={(value) => {
          if (typeof value === "string" && value) onColorChange(value);
        }}
        aria-label="Color"
      >
        {PALETTE.map((c, i) => (
          <Tooltip key={c.value}>
            <TooltipTrigger asChild>
              <SegmentedControlItem
                value={c.value}
                iconOnly
                className="!size-6 !rounded-md"
                aria-label={c.name}
              >
                <span className="size-3.5 rounded-full" style={{ backgroundColor: c.value }} />
              </SegmentedControlItem>
            </TooltipTrigger>
            <TooltipContent shortcut={[String(i + 1)]}>{c.name}</TooltipContent>
          </Tooltip>
        ))}
        {customColors.map((c) => (
          <Tooltip key={c}>
            <TooltipTrigger asChild>
              <SegmentedControlItem
                value={c}
                iconOnly
                className="!size-6 !rounded-md"
                aria-label={`Recent color ${c}`}
              >
                <span className="size-3.5 rounded-full" style={{ backgroundColor: c }} />
              </SegmentedControlItem>
            </TooltipTrigger>
            <TooltipContent>Recent color</TooltipContent>
          </Tooltip>
        ))}
      </SegmentedControl>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={swatchRef}
            type="button"
            aria-label="Custom color"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => onPickerOpenChange(!pickerOpen)}
            className="no-drag size-7 shrink-0 rounded-md border border-white/15 shadow-inner"
            style={{ backgroundColor: color }}
          />
        </TooltipTrigger>
        <TooltipContent>Custom color</TooltipContent>
      </Tooltip>
      {pickerOpen ? (
        <ColorPopover
          anchorRef={swatchRef}
          color={color}
          recentColors={customColors}
          onApply={applyColor}
          onClose={() => onPickerOpenChange(false)}
        />
      ) : null}

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-[68px]">
            <Slider
              variant="filled"
              size="small"
              className="!h-7 w-full !rounded-md"
              value={[size]}
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={1}
              onValueChange={(value) => onSizeChange(value[0])}
              endContent={(v) => <span className="tabular-nums">{v}</span>}
              endContentClassName="!min-w-7 !pr-2.5 !text-sm"
              aria-label="Brush size"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent shortcut={["[", "]"]}>Brush size</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className={
              "!size-6" + (vanishing ? " !bg-orange-500/95 !text-white hover:!bg-orange-500" : "")
            }
            aria-pressed={vanishing}
            onClick={onVanishingToggle}
            aria-label="Vanishing ink"
          >
            <Ghost className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["G"]}>Vanishing ink</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Undo"
          >
            <Undo2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["⌘", "Z"]}>Undo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label="Redo"
          >
            <Redo2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["⌘", "⇧", "Z"]}>Redo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            disabled={!canClear}
            onClick={onClear}
            aria-label="Clear all"
          >
            <Eraser className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["C"]}>Clear all</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            onClick={onExit}
            aria-label="Stop drawing"
          >
            <X className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["Esc"]}>Stop drawing</TooltipContent>
      </Tooltip>
    </div>
  );
}

interface ColorPopoverProps {
  anchorRef: RefObject<HTMLButtonElement | null>;
  color: string;
  recentColors: string[];
  onApply: (color: string) => void;
  onClose: () => void;
}

/** Estimated popover size, used to place it before it has measured itself. */
const POPOVER_WIDTH = 168;
const POPOVER_HEIGHT = 200;
const POPOVER_GAP = 8;
const POPOVER_MARGIN = 8;

/**
 * In-window color picker rendered as plain DOM inside the overlay (the native
 * macOS color panel would open behind the screen-saver-level overlay). Shows a
 * preset grid, the recent-colors row, and a hex input. Positions itself above
 * the anchoring swatch, flipping below when there is no room. Closes on outside
 * click; Escape is handled by the overlay's window keydown listener.
 */
function ColorPopover({ anchorRef, color, recentColors, onApply, onClose }: ColorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Place the popover relative to the swatch: above by default, below when the
  // toolbar sits near the top edge; clamp horizontally into the viewport.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const height = popoverRef.current?.offsetHeight ?? POPOVER_HEIGHT;
    const width = popoverRef.current?.offsetWidth ?? POPOVER_WIDTH;
    const above = rect.top - POPOVER_GAP - height;
    const below = rect.bottom + POPOVER_GAP;
    const top = above >= POPOVER_MARGIN ? above : below;
    const centered = rect.left + rect.width / 2 - width / 2;
    const maxLeft = window.innerWidth - width - POPOVER_MARGIN;
    const left = Math.min(Math.max(POPOVER_MARGIN, centered), Math.max(POPOVER_MARGIN, maxLeft));
    setPos({ left, top });
  }, [anchorRef]);

  // Close when clicking anywhere outside the popover (but not on the anchor,
  // whose own click toggles the popover).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node;
      if (popoverRef.current?.contains(node)) return;
      if (anchorRef.current?.contains(node)) return;
      onClose();
    };
    // Capture phase so the canvas's own pointerdown does not run first.
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchorRef, onClose]);

  const submitHex = () => {
    const normalized = normalizeHexColor(hex);
    if (normalized) onApply(normalized);
  };

  const normalizedHex = normalizeHexColor(hex);
  const hexInvalid = hex.trim() !== "" && normalizedHex === null;

  // Rendered through a portal to document.body: the toolbar div uses `transform`
  // (default -translate-x-1/2) and `backdrop-filter`, both of which would make a
  // `position: fixed` descendant resolve against the toolbar box instead of the
  // viewport, throwing the popover off-screen.
  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Color picker"
      className="no-drag fixed z-40 flex w-[168px] flex-col gap-2 rounded-[12px] border border-white/10 bg-[#1d1d1f]/95 p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <div className="grid grid-cols-5 gap-1.5">
        {COLOR_PRESETS.map((c) => {
          const selected = c.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => onApply(c)}
              className={
                "size-6 rounded-md border shadow-inner " +
                (selected ? "border-white ring-1 ring-white" : "border-white/15")
              }
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>

      {recentColors.length > 0 ? (
        <>
          <Separator orientation="horizontal" />
          <div className="flex flex-wrap gap-1.5">
            {recentColors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Recent color ${c}`}
                onClick={() => onApply(c)}
                className="size-6 rounded-md border border-white/15 shadow-inner"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </>
      ) : null}

      <Separator orientation="horizontal" />

      <div className="flex items-center gap-1.5">
        <span
          className="size-6 shrink-0 rounded-md border border-white/15 shadow-inner"
          style={{ backgroundColor: normalizedHex ?? color }}
        />
        <input
          type="text"
          value={hex}
          spellCheck={false}
          autoComplete="off"
          placeholder="#rrggbb"
          aria-label="Hex color"
          aria-invalid={hexInvalid}
          onChange={(e) => setHex(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter applies the hex value; Escape is left to bubble to the
            // overlay's window keydown, which closes the popover.
            if (e.key === "Enter") {
              e.preventDefault();
              submitHex();
            }
          }}
          className={
            "h-6 w-full min-w-0 rounded-md border bg-black/30 px-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 " +
            (hexInvalid ? "border-red-500/70" : "border-white/15 focus:border-white/30")
          }
        />
      </div>
    </div>,
    document.body,
  );
}
