import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Button,
  ColorWell,
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
  MAX_SIZE,
  MIN_SIZE,
  PALETTE,
  isPaletteColor,
  type OverlayTool,
  type ScreenDrawSettings,
  type ToolbarPosition,
} from "./constants";
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

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
  const { points: pts } = shape;
  if (pts.length === 0) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;

  if (shape.tool === "highlighter") {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = shape.size * 5;
  } else {
    ctx.globalAlpha = 1;
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
    applyModel(modelClearAll(modelRef.current));
  }, [applyModel]);

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
      applyModel(commitShape(model));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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

      if (e.key === "Backspace" || e.key === "Delete") {
        if (modelRef.current.selectedIndex !== null) {
          e.preventDefault();
          applyModel(deleteSelected(modelRef.current));
        }
        return;
      }

      const key = e.key.toLowerCase();
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
    };
  }, [setupCanvas, applyModel, undo, redo, exit, clearAll, selectThisDisplay, changeTool]);

  const showToolbar =
    displayIdRef.current === null ||
    activeDisplayId === null ||
    displayIdRef.current === activeDisplayId;

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
          size={size}
          onSizeChange={setSize}
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
  size: number;
  onSizeChange: (size: number) => void;
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
  size,
  onSizeChange,
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

      <ColorWell
        value={color}
        onChange={onColorChange}
        onCommit={onColorCommit}
        size="small"
        className="!size-7 !rounded-md"
        aria-label="Custom color"
      />

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
