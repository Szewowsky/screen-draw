/**
 * Pure drawing model for the overlay.
 *
 * Shape types, Shift-constraint math, geometry helpers, and undo/redo state
 * transitions — no Electron, DOM, or React imports, so the module is unit
 * testable in plain Node. The overlay component feeds pointer/keyboard input
 * through these functions and paints the resulting state onto its canvas.
 *
 * The model is immutable: every transition returns a new `DrawingModel` and
 * never mutates its input, so snapshots stored in the undo/redo stacks stay
 * valid without copying.
 */

import type { DrawTool } from "./constants";

export interface Point {
  x: number;
  y: number;
}

export interface Shape {
  tool: DrawTool;
  color: string;
  size: number;
  points: readonly Point[];
}

/** Maximum number of undoable operations kept in history (oldest evicted first). */
export const HISTORY_LIMIT = 100;

/** Extra grab distance beyond the painted stroke, so thin lines stay selectable. */
export const HIT_TOLERANCE = 4;

/**
 * Minimum spacing (CSS px) between stored freehand points. A pointermove closer
 * than this to the last stored point is dropped, keeping long slow strokes from
 * collecting thousands of near-coincident points (which the renderer re-strokes
 * each frame). A committed stroke may therefore fall up to this far short of the
 * exact pointer-up position — visually indistinguishable.
 */
export const MIN_POINT_DISTANCE = 1.5;

/** An in-progress move of the selected shape (the shape is lifted out of `shapes`). */
export interface DragState {
  /** Z-order position the shape is restored to when the drag ends. */
  readonly index: number;
  /** Pointer position where the drag started. */
  readonly start: Point;
  /** The untranslated shape being dragged. */
  readonly base: Shape;
  /** The committed set before the drag, recorded in history when the move commits. */
  readonly baseShapes: readonly Shape[];
  readonly dx: number;
  readonly dy: number;
}

export interface EraseDragState {
  /** The committed set before the eraser drag, recorded when the first hit happens. */
  readonly baseShapes: readonly Shape[];
  /** True once this drag has erased at least one shape and recorded history. */
  readonly erased: boolean;
}

export interface DrawingModel {
  /** Committed shapes in painter order (last = topmost). */
  readonly shapes: readonly Shape[];
  /** The in-progress shape being drawn, if any. */
  readonly current: Shape | null;
  /** Index of the selected shape in `shapes`, or null. At most one shape is selected. */
  readonly selectedIndex: number | null;
  /** The in-progress move of the selected shape, if any. */
  readonly drag: DragState | null;
  /** The in-progress eraser drag, if any. */
  readonly eraseDrag: EraseDragState | null;
  readonly undoStack: readonly (readonly Shape[])[];
  readonly redoStack: readonly (readonly Shape[])[];
  /**
   * Bumped whenever the committed shape set changes (commit, undo, redo,
   * clear, move, delete). Renderers cache a rasterized committed layer and
   * rebuild it only when this changes; in-progress updates leave it untouched.
   */
  readonly revision: number;
}

export function createModel(): DrawingModel {
  return {
    shapes: [],
    current: null,
    selectedIndex: null,
    drag: null,
    eraseDrag: null,
    undoStack: [],
    redoStack: [],
    revision: 0,
  };
}

/** Apply the Shift-key constraint to a shape's end point (45° snap for lines, square/circle for boxes). */
export function constrainPoint(tool: DrawTool, start: Point, end: Point, shift: boolean): Point {
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

/** Begin a new in-progress shape at `point`. */
export function startShape(
  model: DrawingModel,
  options: { tool: DrawTool; color: string; size: number },
  point: Point,
): DrawingModel {
  return {
    ...model,
    current: { tool: options.tool, color: options.color, size: options.size, points: [point] },
  };
}

/** Extend the in-progress shape to `point`, honoring the Shift constraint. */
export function updateShape(model: DrawingModel, point: Point, shift: boolean): DrawingModel {
  const current = model.current;
  if (!current) return model;
  const start = current.points[0];
  let points: readonly Point[];
  if (current.tool === "pen" || current.tool === "highlighter") {
    if (shift) {
      // Shift collapses the freehand stroke to a straight origin → cursor line.
      points = [start, point];
    } else {
      // Thin sub-`MIN_POINT_DISTANCE` moves: return the same model reference so
      // the caller skips the repaint entirely. The first point is always kept.
      const last = current.points[current.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) return model;
      points = [...current.points, point];
    }
  } else {
    points = [start, constrainPoint(current.tool, start, point, shift)];
  }
  return { ...model, current: { ...current, points } };
}

function pushHistory(
  stack: readonly (readonly Shape[])[],
  snapshot: readonly Shape[],
): readonly (readonly Shape[])[] {
  const next = [...stack, snapshot];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/**
 * Discard the in-progress shape without committing it. Used when an interaction
 * is cancelled (e.g. pinning while mid-stroke), so a half-drawn shape never
 * floats over the user's work. The committed set is untouched, so `revision` is
 * left as-is (the cached committed layer stays valid) and undo/redo never see
 * the discarded shape.
 */
export function discardCurrent(model: DrawingModel): DrawingModel {
  return model.current ? { ...model, current: null } : model;
}

/** Commit the in-progress shape. A committed shape invalidates the redo stack. */
export function commitShape(model: DrawingModel): DrawingModel {
  if (!model.current) return model;
  return {
    ...model,
    shapes: [...model.shapes, model.current],
    current: null,
    undoStack: pushHistory(model.undoStack, model.shapes),
    redoStack: [],
    revision: model.revision + 1,
  };
}

export function undo(model: DrawingModel): DrawingModel {
  const snapshot = model.undoStack[model.undoStack.length - 1];
  if (!snapshot || model.drag || model.eraseDrag) return model;
  return {
    ...model,
    shapes: snapshot,
    selectedIndex: null,
    undoStack: model.undoStack.slice(0, -1),
    redoStack: [...model.redoStack, model.shapes],
    revision: model.revision + 1,
  };
}

export function redo(model: DrawingModel): DrawingModel {
  const snapshot = model.redoStack[model.redoStack.length - 1];
  if (!snapshot || model.drag || model.eraseDrag) return model;
  return {
    ...model,
    shapes: snapshot,
    selectedIndex: null,
    undoStack: pushHistory(model.undoStack, model.shapes),
    redoStack: model.redoStack.slice(0, -1),
    revision: model.revision + 1,
  };
}

/** Remove all committed shapes. Undoable like any other operation. */
export function clearAll(model: DrawingModel): DrawingModel {
  if (model.eraseDrag || (model.shapes.length === 0 && !model.drag)) return model;
  return {
    ...model,
    shapes: [],
    selectedIndex: null,
    drag: null,
    undoStack: pushHistory(model.undoStack, model.drag ? model.drag.baseShapes : model.shapes),
    redoStack: [],
    revision: model.revision + 1,
  };
}

/** Select the shape at `index` (or deselect with null). No-op while dragging. */
export function selectShape(model: DrawingModel, index: number | null): DrawingModel {
  if (model.drag || model.eraseDrag) return model;
  const valid = index !== null && index >= 0 && index < model.shapes.length ? index : null;
  if (valid === model.selectedIndex) return model;
  return { ...model, selectedIndex: valid };
}

/**
 * Start moving the selected shape. The shape is lifted out of the committed
 * set (so the cached layer rebuilds without it once) and rendered separately
 * while the drag is in progress.
 */
export function beginDrag(model: DrawingModel, point: Point): DrawingModel {
  if (model.drag || model.eraseDrag || model.selectedIndex === null) return model;
  const index = model.selectedIndex;
  const base = model.shapes[index];
  return {
    ...model,
    shapes: model.shapes.filter((_, i) => i !== index),
    selectedIndex: null,
    drag: { index, start: point, base, baseShapes: model.shapes, dx: 0, dy: 0 },
    revision: model.revision + 1,
  };
}

/** Track the pointer during a move. Does not touch the committed set. */
export function updateDrag(model: DrawingModel, point: Point): DrawingModel {
  const drag = model.drag;
  if (!drag) return model;
  return {
    ...model,
    drag: { ...drag, dx: point.x - drag.start.x, dy: point.y - drag.start.y },
  };
}

/** The dragged shape at its current position. */
export function draggedShape(drag: DragState): Shape {
  return translateShape(drag.base, drag.dx, drag.dy);
}

/**
 * Commit the move: the shape returns to its original z-order at the new
 * position and stays selected. A zero-distance drag (a plain selection click)
 * records nothing in history.
 */
export function endDrag(model: DrawingModel): DrawingModel {
  const drag = model.drag;
  if (!drag) return model;
  const moved = drag.dx !== 0 || drag.dy !== 0;
  const shape = draggedShape(drag);
  return {
    ...model,
    shapes: [...model.shapes.slice(0, drag.index), shape, ...model.shapes.slice(drag.index)],
    selectedIndex: drag.index,
    drag: null,
    undoStack: moved ? pushHistory(model.undoStack, drag.baseShapes) : model.undoStack,
    redoStack: moved ? [] : model.redoStack,
    revision: model.revision + 1,
  };
}

/**
 * Cancel the move: the shape returns to its pre-drag position and stays
 * selected. Nothing is recorded in history.
 */
export function cancelDrag(model: DrawingModel): DrawingModel {
  const drag = model.drag;
  if (!drag) return model;
  return {
    ...model,
    shapes: drag.baseShapes,
    selectedIndex: drag.index,
    drag: null,
    revision: model.revision + 1,
  };
}

/** Delete the selected shape. Undoable like any other operation. */
export function deleteSelected(model: DrawingModel): DrawingModel {
  if (model.drag || model.eraseDrag || model.selectedIndex === null) return model;
  return {
    ...model,
    shapes: model.shapes.filter((_, i) => i !== model.selectedIndex),
    selectedIndex: null,
    undoStack: pushHistory(model.undoStack, model.shapes),
    redoStack: [],
    revision: model.revision + 1,
  };
}

/** A restyle changes the selected shape's color and/or size, leaving its geometry. */
export interface ShapeStyle {
  color?: string;
  size?: number;
}

/**
 * True when `a` and `b` are the same committed set except that the shape at
 * `index` differs only in the single restyle field `field` (its other style
 * fields, points, and tool are equal) and every other shape is reference-equal.
 * Used to decide whether a coalescing restyle may merge into the undo top: it
 * merges only for a continuous same-field gesture (e.g. a size-slider drag), so
 * a size change that follows a color pick still records its own entry.
 */
function isSameFieldRestyle(
  a: readonly Shape[],
  b: readonly Shape[],
  index: number,
  field: "color" | "size",
): boolean {
  if (a.length !== b.length || index < 0 || index >= a.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (i === index) continue;
    if (a[i] !== b[i]) return false;
  }
  const sa = a[index];
  const sb = b[index];
  const other = field === "color" ? "size" : "color";
  return sa.tool === sb.tool && sa.points === sb.points && sa[other] === sb[other];
}

/**
 * Replace the selected shape's color and/or size, keeping its geometry and
 * selection. No-op (returns the same model) when nothing is selected, a drag is
 * active, or the merged style equals the current shape. Undoable like any other
 * operation: the previous committed set is pushed to the undo stack, redo is
 * cleared, and the revision bumped.
 *
 * Coalescing (`options.coalesce`, default false): a slider drag emits many
 * changes per second, which would flood the 100-entry history. With
 * `coalesce: true` the change merges into the undo top *iff* that top is the
 * baseline of a restyle of this same shape in the same single field (see
 * {@link isSameFieldRestyle}) — so one continuous same-field gesture yields one
 * undo entry, while a change in a different field (e.g. size after a color pick)
 * still records its own entry. Discrete picks pass `coalesce: false` (the
 * default) and always record. Consequence: two consecutive same-field gestures
 * with nothing between them merge into one entry — acceptable within spec.
 */
export function restyleSelected(
  model: DrawingModel,
  style: ShapeStyle,
  options: { coalesce?: boolean } = {},
): DrawingModel {
  if (model.drag || model.eraseDrag || model.selectedIndex === null) return model;
  const index = model.selectedIndex;
  const shape = model.shapes[index];
  const color = style.color ?? shape.color;
  const size = style.size ?? shape.size;
  if (color === shape.color && size === shape.size) return model;

  const shapes = model.shapes.map((s, i) => (i === index ? { ...s, color, size } : s));

  // Which single field is this restyle writing? Only a single-field change can
  // coalesce; a both-fields change always records a fresh entry.
  const field: "color" | "size" | null =
    color !== shape.color && size !== shape.size ? null : color !== shape.color ? "color" : "size";
  const top = model.undoStack[model.undoStack.length - 1];
  const merge =
    options.coalesce === true &&
    field !== null &&
    top !== undefined &&
    isSameFieldRestyle(top, model.shapes, index, field);

  return {
    ...model,
    shapes,
    undoStack: merge ? model.undoStack : pushHistory(model.undoStack, model.shapes),
    redoStack: [],
    revision: model.revision + 1,
  };
}

/** Move a shape by (dx, dy), translating every point. */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  if (dx === 0 && dy === 0) return shape;
  return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

export function canUndo(model: DrawingModel): boolean {
  return model.undoStack.length > 0;
}

export function canRedo(model: DrawingModel): boolean {
  return model.redoStack.length > 0;
}

/** The effective painted stroke width (the highlighter paints a widened band). */
export function strokeWidth(shape: Shape): number {
  return shape.tool === "highlighter" ? shape.size * 5 : shape.size;
}

/** The two wing endpoints of an arrowhead, matching the painted arrowhead geometry. */
export function arrowHeadPoints(from: Point, to: Point, size: number): [Point, Point] {
  const headLen = Math.max(12, size * 3.5);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return [
    {
      x: to.x - headLen * Math.cos(angle - Math.PI / 6),
      y: to.y - headLen * Math.sin(angle - Math.PI / 6),
    },
    {
      x: to.x - headLen * Math.cos(angle + Math.PI / 6),
      y: to.y - headLen * Math.sin(angle + Math.PI / 6),
    },
  ];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Axis-aligned bounding box of a shape's painted extent (stroke width included). */
export function getBounds(shape: Shape): Bounds | null {
  const pts = shape.points;
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (p: Point) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const p of pts) include(p);
  if (shape.tool === "arrow" && pts.length > 1) {
    for (const p of arrowHeadPoints(pts[0], pts[pts.length - 1], shape.size)) include(p);
  }
  const pad = strokeWidth(shape) / 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

function withinPolyline(point: Point, pts: readonly Point[], radius: number): boolean {
  if (pts.length === 1) return Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= radius;
  for (let i = 1; i < pts.length; i++) {
    if (distanceToSegment(point, pts[i - 1], pts[i]) <= radius) return true;
  }
  return false;
}

/** Begin a stroke-level eraser drag. The undo snapshot is recorded only on first hit. */
export function beginErase(model: DrawingModel): DrawingModel {
  if (model.drag || model.eraseDrag) return model;
  return {
    ...model,
    current: null,
    selectedIndex: null,
    eraseDrag: { baseShapes: model.shapes, erased: false },
  };
}

function eraseHitsAt(shapes: readonly Shape[], point: Point): readonly Shape[] | null {
  let remaining = shapes;
  let erased = false;
  while (true) {
    const index = hitTest(remaining, point);
    if (index === null) return erased ? remaining : null;
    remaining = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
    erased = true;
  }
}

/** Erase every committed shape touched by `point`, coalescing one drag into one undo entry. */
export function eraseAt(model: DrawingModel, point: Point): DrawingModel {
  const eraseDrag = model.eraseDrag;
  if (!eraseDrag) return model;
  const shapes = eraseHitsAt(model.shapes, point);
  if (!shapes) return model;
  return {
    ...model,
    shapes,
    eraseDrag: { ...eraseDrag, erased: true },
    undoStack: eraseDrag.erased ? model.undoStack : pushHistory(model.undoStack, eraseDrag.baseShapes),
    redoStack: [],
    revision: model.revision + 1,
  };
}

/** End the eraser drag. Empty drags leave history and revision untouched. */
export function endErase(model: DrawingModel): DrawingModel {
  if (!model.eraseDrag) return model;
  return { ...model, eraseDrag: null };
}

const ELLIPSE_HIT_SAMPLES = 64;

/** Whether `point` hits the painted outline of `shape` (stroke width + tolerance). */
export function hitsShape(shape: Shape, point: Point): boolean {
  const pts = shape.points;
  if (pts.length === 0) return false;
  const radius = strokeWidth(shape) / 2 + HIT_TOLERANCE;
  const a = pts[0];
  const b = pts[pts.length - 1];

  switch (shape.tool) {
    case "pen":
    case "highlighter":
      return withinPolyline(point, pts, radius);
    case "line":
      return distanceToSegment(point, a, b) <= radius;
    case "arrow": {
      if (distanceToSegment(point, a, b) <= radius) return true;
      // The arrowhead wings are painted too — clicking the barbs should hit.
      const [left, right] = arrowHeadPoints(a, b, shape.size);
      return (
        distanceToSegment(point, b, left) <= radius || distanceToSegment(point, b, right) <= radius
      );
    }
    case "rectangle": {
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
      return withinPolyline(point, corners, radius);
    }
    case "ellipse": {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      const outline: Point[] = [];
      for (let i = 0; i <= ELLIPSE_HIT_SAMPLES; i++) {
        const t = (i / ELLIPSE_HIT_SAMPLES) * Math.PI * 2;
        outline.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
      }
      return withinPolyline(point, outline, radius);
    }
  }
}

/** Index of the topmost shape hit at `point`, or null. */
export function hitTest(shapes: readonly Shape[], point: Point): number | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitsShape(shapes[i], point)) return i;
  }
  return null;
}
