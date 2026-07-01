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

export interface DrawingModel {
  /** Committed shapes in painter order (last = topmost). */
  readonly shapes: readonly Shape[];
  /** The in-progress shape being drawn, if any. */
  readonly current: Shape | null;
  readonly undoStack: readonly (readonly Shape[])[];
  readonly redoStack: readonly (readonly Shape[])[];
  /**
   * Bumped whenever the committed shape set changes (commit, undo, redo,
   * clear). Renderers cache a rasterized committed layer and rebuild it only
   * when this changes; in-progress updates leave it untouched.
   */
  readonly revision: number;
}

export function createModel(): DrawingModel {
  return { shapes: [], current: null, undoStack: [], redoStack: [], revision: 0 };
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
    // Shift collapses the freehand stroke to a straight origin → cursor line.
    points = shift ? [start, point] : [...current.points, point];
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

/** Commit the in-progress shape. A committed shape invalidates the redo stack. */
export function commitShape(model: DrawingModel): DrawingModel {
  if (!model.current) return model;
  return {
    shapes: [...model.shapes, model.current],
    current: null,
    undoStack: pushHistory(model.undoStack, model.shapes),
    redoStack: [],
    revision: model.revision + 1,
  };
}

export function undo(model: DrawingModel): DrawingModel {
  const snapshot = model.undoStack[model.undoStack.length - 1];
  if (!snapshot) return model;
  return {
    ...model,
    shapes: snapshot,
    undoStack: model.undoStack.slice(0, -1),
    redoStack: [...model.redoStack, model.shapes],
    revision: model.revision + 1,
  };
}

export function redo(model: DrawingModel): DrawingModel {
  const snapshot = model.redoStack[model.redoStack.length - 1];
  if (!snapshot) return model;
  return {
    ...model,
    shapes: snapshot,
    undoStack: pushHistory(model.undoStack, model.shapes),
    redoStack: model.redoStack.slice(0, -1),
    revision: model.revision + 1,
  };
}

/** Remove all committed shapes. Undoable like any other operation. */
export function clearAll(model: DrawingModel): DrawingModel {
  if (model.shapes.length === 0) return model;
  return {
    ...model,
    shapes: [],
    undoStack: pushHistory(model.undoStack, model.shapes),
    redoStack: [],
    revision: model.revision + 1,
  };
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
