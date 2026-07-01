import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  Pencil,
  Redo2,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { MAX_SIZE, MIN_SIZE, PALETTE, type DrawTool, type ScreenDrawSettings } from "./constants";

interface Point {
  x: number;
  y: number;
}

interface Shape {
  tool: DrawTool;
  color: string;
  size: number;
  points: Point[];
}

const TOOLS: { tool: DrawTool; label: string; key: string; Icon: typeof Pencil }[] = [
  { tool: "pen", label: "Pen", key: "P", Icon: Pencil },
  { tool: "highlighter", label: "Highlighter", key: "H", Icon: Highlighter },
  { tool: "line", label: "Line", key: "L", Icon: Minus },
  { tool: "arrow", label: "Arrow", key: "A", Icon: ArrowUpRight },
  { tool: "rectangle", label: "Rectangle", key: "R", Icon: Square },
  { tool: "ellipse", label: "Ellipse", key: "O", Icon: Circle },
];

/** Apply the Shift-key constraint to a shape's end point (45° snap for lines, square/circle for boxes). */
function constrainPoint(tool: DrawTool, start: Point, end: Point, shift: boolean): Point {
  if (!shift) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (tool === "line" || tool === "arrow") {
    const step = Math.PI / 4;
    const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    return { x: start.x + len * Math.cos(snapped), y: start.y + len * Math.sin(snapped) };
  }
  if (tool === "rectangle" || tool === "ellipse") {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
  }
  return end;
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const headLen = Math.max(12, size * 3.5);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
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
  const shapesRef = useRef<Shape[]>([]);
  const redoRef = useRef<Shape[]>([]);
  const currentRef = useRef<Shape | null>(null);
  const drawingRef = useRef(false);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState(PALETTE[0].value);
  const [size, setSize] = useState(4);
  const [shapeCount, setShapeCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // Keep the latest tool settings available to the (stable) pointer handlers.
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;

  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    for (const shape of shapesRef.current) {
      drawShape(ctx, shape);
    }
    if (currentRef.current) {
      drawShape(ctx, currentRef.current);
    }
  }, []);

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

  const undo = useCallback(() => {
    const shape = shapesRef.current.pop();
    if (!shape) return;
    redoRef.current.push(shape);
    setShapeCount(shapesRef.current.length);
    setRedoCount(redoRef.current.length);
    redraw();
  }, [redraw]);

  const redo = useCallback(() => {
    const shape = redoRef.current.pop();
    if (!shape) return;
    shapesRef.current.push(shape);
    setShapeCount(shapesRef.current.length);
    setRedoCount(redoRef.current.length);
    redraw();
  }, [redraw]);

  const clearAll = useCallback(() => {
    shapesRef.current = [];
    redoRef.current = [];
    setShapeCount(0);
    setRedoCount(0);
    redraw();
  }, [redraw]);

  const exit = useCallback(() => {
    void window.screenDraw.ipc.invoke("overlay:setActive", false);
  }, []);

  // Load defaults and stay in sync with the control window.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const settings = await window.screenDraw.ipc.invoke<ScreenDrawSettings>("settings:get");
        setColor(settings.defaultColor);
        setSize(settings.defaultSize);
      } catch {
        // Fall back to component defaults.
      }
      unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
        const next = params as ScreenDrawSettings;
        if (next?.defaultColor) setColor(next.defaultColor);
        if (typeof next?.defaultSize === "number") setSize(next.defaultSize);
      });
    })();
    return () => unsub?.();
  }, []);

  // Undo/redo arrive as backend broadcasts because ⌘Z / ⌘⇧Z are registered as
  // global shortcuts while drawing (the Edit menu would otherwise swallow them).
  useEffect(() => {
    const offUndo = window.screenDraw.ipc.on("overlay:undo", () => undo());
    const offRedo = window.screenDraw.ipc.on("overlay:redo", () => redo());
    return () => {
      offUndo?.();
      offRedo?.();
    };
  }, [undo, redo]);

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
      canvas.setPointerCapture(e.pointerId);
      currentRef.current = {
        tool: toolRef.current,
        color: colorRef.current,
        size: sizeRef.current,
        points: [toPoint(e)],
      };
      drawingRef.current = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      const shape = currentRef.current;
      if (!drawingRef.current || !shape) return;
      const p = toPoint(e);
      const start = shape.points[0];
      if (shape.tool === "pen" || shape.tool === "highlighter") {
        if (e.shiftKey) {
          // Straight-line constraint: collapse the freehand stroke to origin → cursor.
          shape.points = [start, p];
        } else {
          shape.points.push(p);
        }
      } else {
        const end = constrainPoint(shape.tool, start, p, e.shiftKey);
        if (shape.points.length < 2) shape.points.push(end);
        else shape.points[1] = end;
      }
      redraw();
    };

    const onPointerUp = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (currentRef.current) {
        shapesRef.current.push(currentRef.current);
        currentRef.current = null;
        setShapeCount(shapesRef.current.length);
        // A new shape invalidates the redo stack, matching standard undo/redo behavior.
        redoRef.current = [];
        setRedoCount(0);
      }
      redraw();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
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

      const key = e.key.toLowerCase();
      const toolForKey = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (toolForKey) {
        e.preventDefault();
        setTool(toolForKey.tool);
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
  }, [setupCanvas, redraw, undo, redo, exit, clearAll]);

  return (
    <div className="fixed inset-0 h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
      <FloatingToolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        size={size}
        onSizeChange={setSize}
        canUndo={shapeCount > 0}
        onUndo={undo}
        canRedo={redoCount > 0}
        onRedo={redo}
        onClear={clearAll}
        onExit={exit}
      />
    </div>
  );
}

interface FloatingToolbarProps {
  tool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  size: number;
  onSizeChange: (size: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onClear: () => void;
  onExit: () => void;
}

function FloatingToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  size,
  onSizeChange,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onClear,
  onExit,
}: FloatingToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const onGripDown = (e: ReactPointerEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (ev: PointerEvent) => {
      if (!dragOffset.current) return;
      setPos({ x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y });
    };
    const onUp = () => {
      dragOffset.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={barRef}
      className={
        "fixed z-30 flex h-11 items-center gap-1.5 rounded-panel border border-separator bg-popover px-2 shadow-lg" +
        (pos ? "" : " bottom-8 left-1/2 -translate-x-1/2")
      }
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Move toolbar"
            onPointerDown={onGripDown}
            className="flex h-7 cursor-grab items-center text-tertiary active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Drag to move</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <SegmentedControl
        type="single"
        size="small"
        value={tool}
        onValueChange={(value) => {
          if (typeof value === "string" && value) onToolChange(value as DrawTool);
        }}
        aria-label="Drawing tool"
      >
        {TOOLS.map(({ tool: t, label, key, Icon }) => (
          <Tooltip key={t}>
            <TooltipTrigger asChild>
              <SegmentedControlItem value={t} iconOnly aria-label={label}>
                <Icon className="size-4" />
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
        onValueChange={(value) => {
          if (typeof value === "string" && value) onColorChange(value);
        }}
        aria-label="Color"
      >
        {PALETTE.map((c, i) => (
          <Tooltip key={c.value}>
            <TooltipTrigger asChild>
              <SegmentedControlItem value={c.value} iconOnly aria-label={c.name}>
                <span className="size-4 rounded-full" style={{ backgroundColor: c.value }} />
              </SegmentedControlItem>
            </TooltipTrigger>
            <TooltipContent shortcut={[String(i + 1)]}>{c.name}</TooltipContent>
          </Tooltip>
        ))}
      </SegmentedControl>

      <ColorWell value={color} onChange={onColorChange} size="small" aria-label="Custom color" />

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-24">
            <Slider
              variant="filled"
              size="small"
              className="w-full"
              value={[size]}
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={1}
              onValueChange={(value) => onSizeChange(value[0])}
              endContent={(v) => <span className="tabular-nums">{v}</span>}
              aria-label="Brush size"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent shortcut={["[", "]"]}>Brush size</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="transparent" size="small" iconOnly disabled={!canUndo} onClick={onUndo} aria-label="Undo">
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["⌘", "Z"]}>Undo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="transparent" size="small" iconOnly disabled={!canRedo} onClick={onRedo} aria-label="Redo">
            <Redo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["⌘", "⇧", "Z"]}>Redo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="transparent" size="small" iconOnly disabled={!canUndo} onClick={onClear} aria-label="Clear all">
            <Eraser className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["C"]}>Clear all</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="transparent" size="small" iconOnly onClick={onExit} aria-label="Stop drawing">
            <X className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent shortcut={["Esc"]}>Stop drawing</TooltipContent>
      </Tooltip>
    </div>
  );
}
