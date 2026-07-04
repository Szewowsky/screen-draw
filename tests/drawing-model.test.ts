import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  addText,
  beginDrag,
  canRedo,
  canUndo,
  cancelErase,
  clearAll,
  commitShape,
  constrainPoint,
  createModel,
  beginErase,
  deleteSelected,
  discardCurrent,
  endDrag,
  endErase,
  eraseAt,
  extendFreehandPoints,
  getBounds,
  hitsShape,
  MIN_POINT_DISTANCE,
  redo,
  restyleSelected,
  selectShape,
  startShape,
  undo,
  updateDrag,
  updateShape,
  textFontPx,
  type DrawingModel,
  type MeasureText,
  type Point,
  type Shape,
} from "../renderer/overlay/drawing-model";
import type { DrawTool } from "../renderer/overlay/constants";

const PEN = { tool: "pen" as DrawTool, color: "#FF3B30", size: 4 };

function drawStroke(model: DrawingModel, points: Point[], tool = PEN): DrawingModel {
  let next = startShape(model, tool, points[0]);
  for (const p of points.slice(1)) {
    next = updateShape(next, p, false);
  }
  return commitShape(next);
}

describe("point collection", () => {
  it("collects every pointer position for the pen", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 3 },
    ];
    const model = drawStroke(createModel(), pts);
    expect(model.shapes).toHaveLength(1);
    expect(model.shapes[0].points).toEqual(pts);
    expect(model.current).toBeNull();
  });

  it("collects every pointer position for the highlighter", () => {
    const pts = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    const model = drawStroke(createModel(), pts, { ...PEN, tool: "highlighter" });
    expect(model.shapes[0].points).toEqual(pts);
    expect(model.shapes[0].tool).toBe("highlighter");
  });

  it("keeps a single-tap stroke as one point (rendered as a dot)", () => {
    const model = commitShape(startShape(createModel(), PEN, { x: 7, y: 8 }));
    expect(model.shapes[0].points).toEqual([{ x: 7, y: 8 }]);
  });

  it("collapses a pen stroke to origin → cursor while Shift is held", () => {
    let model = startShape(createModel(), PEN, { x: 0, y: 0 });
    model = updateShape(model, { x: 5, y: 5 }, false);
    model = updateShape(model, { x: 20, y: 9 }, true);
    expect(model.current?.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 9 },
    ]);
  });

  it("keeps exactly two points for two-point shapes as the cursor moves", () => {
    let model = startShape(createModel(), { ...PEN, tool: "rectangle" }, { x: 0, y: 0 });
    model = updateShape(model, { x: 5, y: 5 }, false);
    model = updateShape(model, { x: 9, y: 2 }, false);
    expect(model.current?.points).toEqual([
      { x: 0, y: 0 },
      { x: 9, y: 2 },
    ]);
  });
});

describe("point thinning", () => {
  it("extendFreehandPoints appends a kept freehand point", () => {
    const points = [{ x: 0, y: 0 }];
    const next = extendFreehandPoints(points, { x: MIN_POINT_DISTANCE, y: 0 }, false);

    expect(next).toEqual([
      { x: 0, y: 0 },
      { x: MIN_POINT_DISTANCE, y: 0 },
    ]);
    expect(next).not.toBe(points);
  });

  it("extendFreehandPoints returns null for a sub-threshold point", () => {
    const points = [{ x: 0, y: 0 }];

    expect(extendFreehandPoints(points, { x: MIN_POINT_DISTANCE / 2, y: 0 }, false)).toBeNull();
  });

  it("extendFreehandPoints collapses Shift freehand to origin and cursor", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];

    expect(extendFreehandPoints(points, { x: 20, y: 5 }, true)).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 5 },
    ]);
  });

  it("appends a freehand point that is at least MIN_POINT_DISTANCE away", () => {
    let model = startShape(createModel(), PEN, { x: 0, y: 0 });
    model = updateShape(model, { x: MIN_POINT_DISTANCE, y: 0 }, false);
    expect(model.current?.points).toEqual([
      { x: 0, y: 0 },
      { x: MIN_POINT_DISTANCE, y: 0 },
    ]);
  });

  it("drops a sub-threshold freehand point, returning the identical model reference", () => {
    const model = startShape(createModel(), PEN, { x: 0, y: 0 });
    const next = updateShape(model, { x: MIN_POINT_DISTANCE / 2, y: 0 }, false);
    expect(next).toBe(model);
  });

  it("thins for the highlighter too", () => {
    const model = startShape(createModel(), { ...PEN, tool: "highlighter" }, { x: 0, y: 0 });
    const next = updateShape(model, { x: 1, y: 0 }, false);
    expect(next).toBe(model);
  });

  it("measures distance from the last stored point, not the stroke origin", () => {
    let model = startShape(createModel(), PEN, { x: 0, y: 0 });
    model = updateShape(model, { x: 10, y: 0 }, false);
    // A move within MIN_POINT_DISTANCE of the last point (10,0) is dropped,
    // even though it is far from the origin.
    const next = updateShape(model, { x: 10.5, y: 0 }, false);
    expect(next).toBe(model);
  });

  it("does not thin the Shift-line path (collapses to [start, point] regardless of distance)", () => {
    let model = startShape(createModel(), PEN, { x: 0, y: 0 });
    model = updateShape(model, { x: 5, y: 5 }, false);
    // A sub-threshold Shift move still collapses the stroke.
    model = updateShape(model, { x: 5.1, y: 5 }, true);
    expect(model.current?.points).toEqual([
      { x: 0, y: 0 },
      { x: 5.1, y: 5 },
    ]);
  });

  it("does not thin shape tools (they keep two points at the cursor)", () => {
    for (const tool of ["line", "arrow", "rectangle", "ellipse"] as const) {
      let model = startShape(createModel(), { ...PEN, tool }, { x: 0, y: 0 });
      // A sub-threshold move still updates the end point.
      model = updateShape(model, { x: MIN_POINT_DISTANCE / 2, y: 0 }, false);
      expect(model.current?.points).toEqual([
        { x: 0, y: 0 },
        { x: MIN_POINT_DISTANCE / 2, y: 0 },
      ]);
    }
  });

  it("commits the thinned points after a stroke with sub-threshold moves", () => {
    let model = startShape(createModel(), PEN, { x: 0, y: 0 });
    model = updateShape(model, { x: 10, y: 0 }, false); // kept
    model = updateShape(model, { x: 10.5, y: 0 }, false); // thinned
    model = updateShape(model, { x: 20, y: 0 }, false); // kept
    model = commitShape(model);
    expect(model.shapes[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
  });
});

describe("Shift constraints", () => {
  const start = { x: 10, y: 10 };

  it("returns the end point unchanged without Shift", () => {
    const end = { x: 42, y: 17 };
    for (const tool of ["pen", "highlighter", "line", "arrow", "rectangle", "ellipse"] as const) {
      expect(constrainPoint(tool, start, end, false)).toEqual(end);
    }
  });

  it("snaps lines and arrows to 45° increments, preserving length", () => {
    for (const tool of ["line", "arrow"] as const) {
      // Nearly horizontal drag snaps to exactly horizontal.
      const nearlyFlat = constrainPoint(tool, start, { x: 30, y: 12 }, true);
      const len = Math.hypot(20, 2);
      expect(nearlyFlat.x).toBeCloseTo(start.x + len);
      expect(nearlyFlat.y).toBeCloseTo(start.y);

      // A ~40° drag snaps to the 45° diagonal.
      const diagonal = constrainPoint(tool, start, { x: 20, y: 18.5 }, true);
      const dx = diagonal.x - start.x;
      const dy = diagonal.y - start.y;
      expect(dy).toBeCloseTo(dx);
    }
  });

  it("constrains rectangles and ellipses to squares in every drag direction", () => {
    for (const tool of ["rectangle", "ellipse"] as const) {
      expect(constrainPoint(tool, start, { x: 30, y: 15 }, true)).toEqual({ x: 30, y: 30 });
      expect(constrainPoint(tool, start, { x: -10, y: 15 }, true)).toEqual({ x: -10, y: 30 });
      expect(constrainPoint(tool, start, { x: 15, y: -30 }, true)).toEqual({ x: 50, y: -30 });
    }
  });

  it("does not constrain pen or highlighter end points (Shift is handled as a straight stroke)", () => {
    const end = { x: 30, y: 12 };
    expect(constrainPoint("pen", start, end, true)).toEqual(end);
    expect(constrainPoint("highlighter", start, end, true)).toEqual(end);
  });
});

describe("undo/redo", () => {
  const p = (x: number): Point[] => [
    { x, y: 0 },
    { x, y: 10 },
  ];

  it("starts with nothing to undo or redo", () => {
    const model = createModel();
    expect(canUndo(model)).toBe(false);
    expect(canRedo(model)).toBe(false);
  });

  it("round-trips adds through undo and redo", () => {
    let model = drawStroke(createModel(), p(1));
    model = drawStroke(model, p(2));

    model = undo(model);
    expect(model.shapes).toHaveLength(1);
    expect(canRedo(model)).toBe(true);

    model = redo(model);
    expect(model.shapes).toHaveLength(2);
    expect(model.shapes[1].points).toEqual(p(2));
    expect(canRedo(model)).toBe(false);
  });

  it("is a no-op when there is nothing to undo or redo", () => {
    const empty = createModel();
    expect(undo(empty)).toBe(empty);
    expect(redo(empty)).toBe(empty);
  });

  it("clears the redo stack when a new shape is drawn", () => {
    let model = drawStroke(createModel(), p(1));
    model = drawStroke(model, p(2));
    model = undo(model);
    expect(canRedo(model)).toBe(true);

    model = drawStroke(model, p(3));
    expect(canRedo(model)).toBe(false);
    expect(model.shapes.map((s) => s.points)).toEqual([p(1), p(3)]);
  });

  it("round-trips clear-all through undo and redo", () => {
    let model = drawStroke(createModel(), p(1));
    model = drawStroke(model, p(2));

    model = clearAll(model);
    expect(model.shapes).toHaveLength(0);

    model = undo(model);
    expect(model.shapes).toHaveLength(2);

    model = redo(model);
    expect(model.shapes).toHaveLength(0);
  });

  it("treats clear-all on an empty canvas as a no-op (nothing recorded in history)", () => {
    const model = createModel();
    expect(clearAll(model)).toBe(model);
  });

  it(`caps history at ${HISTORY_LIMIT} entries, evicting the oldest`, () => {
    const extra = 5;
    let model = createModel();
    for (let i = 0; i < HISTORY_LIMIT + extra; i++) {
      model = drawStroke(model, p(i));
    }

    let undos = 0;
    while (canUndo(model)) {
      model = undo(model);
      undos++;
    }

    expect(undos).toBe(HISTORY_LIMIT);
    // The oldest `extra` shapes fell out of history and can no longer be undone.
    expect(model.shapes).toHaveLength(extra);
    expect(model.shapes[0].points).toEqual(p(0));
  });
});

describe("eraser transitions", () => {
  const verticalStroke = (x: number): Point[] => [
    { x, y: 0 },
    { x, y: 20 },
  ];

  it("erases every shape touched along a drag path", () => {
    let model = drawStroke(createModel(), verticalStroke(0));
    model = drawStroke(model, verticalStroke(12));
    model = beginErase(model);

    model = eraseAt(model, { x: 0, y: 10 });
    model = eraseAt(model, { x: 12, y: 10 });
    model = endErase(model);

    expect(model.shapes).toEqual([]);
  });

  it("erases topmost-through-all shapes under the same point", () => {
    let model = drawStroke(createModel(), verticalStroke(0));
    model = drawStroke(model, verticalStroke(0), { ...PEN, color: "#0A84FF" });
    model = beginErase(model);

    model = eraseAt(model, { x: 0, y: 10 });
    model = endErase(model);

    expect(model.shapes).toEqual([]);
  });

  it("undo restores all shapes erased in one drag", () => {
    let model = drawStroke(createModel(), verticalStroke(0));
    model = drawStroke(model, verticalStroke(12));
    const beforeErase = model.shapes;

    model = beginErase(model);
    model = eraseAt(model, { x: 0, y: 10 });
    model = eraseAt(model, { x: 12, y: 10 });
    model = endErase(model);

    expect(model.shapes).toHaveLength(0);
    expect(canUndo(model)).toBe(true);

    model = undo(model);
    expect(model.shapes).toEqual(beforeErase);
  });

  it("records nothing for an empty drag", () => {
    let model = drawStroke(createModel(), verticalStroke(0));
    const beforeErase = model;

    model = beginErase(model);
    model = eraseAt(model, { x: 100, y: 100 });
    model = endErase(model);

    expect(model.shapes).toEqual(beforeErase.shapes);
    expect(model.undoStack).toBe(beforeErase.undoStack);
    expect(model.revision).toBe(beforeErase.revision);
  });

  it("cancelErase restores shapes and removes the drag undo entry", () => {
    let model = drawStroke(createModel(), verticalStroke(0));
    model = drawStroke(model, verticalStroke(12));
    const beforeErase = model;

    model = beginErase(model);
    model = eraseAt(model, { x: 0, y: 10 });
    model = eraseAt(model, { x: 12, y: 10 });
    expect(model.shapes).toEqual([]);
    expect(model.undoStack).toHaveLength(beforeErase.undoStack.length + 1);

    model = cancelErase(model);

    expect(model.eraseDrag).toBeNull();
    expect(model.shapes).toEqual(beforeErase.shapes);
    expect(model.undoStack).toEqual(beforeErase.undoStack);
    expect(model.redoStack).toEqual(beforeErase.redoStack);
    expect(model.revision).toBeGreaterThan(beforeErase.revision);
    expect(model).not.toBe(beforeErase);
  });

  it("cancelErase without hits leaves history untouched", () => {
    let model = drawStroke(createModel(), verticalStroke(0));
    const beforeErase = model;

    model = beginErase(model);
    model = eraseAt(model, { x: 100, y: 100 });
    model = cancelErase(model);

    expect(model.eraseDrag).toBeNull();
    expect(model.shapes).toEqual(beforeErase.shapes);
    expect(model.undoStack).toBe(beforeErase.undoStack);
    expect(model.redoStack).toBe(beforeErase.redoStack);
    expect(model.revision).toBeGreaterThan(beforeErase.revision);
  });

  it("clears redo when an erase actually removes a shape", () => {
    let model = drawStroke(createModel(), verticalStroke(0));
    model = drawStroke(model, verticalStroke(12));
    model = undo(model);
    expect(canRedo(model)).toBe(true);

    model = beginErase(model);
    model = eraseAt(model, { x: 0, y: 10 });
    model = endErase(model);

    expect(canRedo(model)).toBe(false);
  });
});

describe("text shapes", () => {
  const measureText: MeasureText = (text, fontPx) => {
    expect(text).toBe("Hello");
    expect(fontPx).toBe(textFontPx(4));
    return { width: 42, height: 18 };
  };

  it("commits text as an undoable shape", () => {
    let model = addText(createModel(), { color: "#FF3B30", size: 4, text: "Hello" }, { x: 5, y: 6 });

    expect(model.shapes).toEqual([
      { tool: "text", color: "#FF3B30", size: 4, text: "Hello", points: [{ x: 5, y: 6 }] },
    ]);
    expect(canUndo(model)).toBe(true);

    model = undo(model);
    expect(model.shapes).toEqual([]);
  });

  it("preserves the current in-progress shape when text is added", () => {
    let model = startShape(createModel(), PEN, { x: 0, y: 0 });
    model = updateShape(model, { x: 10, y: 10 }, false);
    const current = model.current;

    model = addText(model, { color: "#0A84FF", size: 4, text: "Hello" }, { x: 5, y: 6 });

    expect(model.current).toBe(current);
    expect(model.shapes).toEqual([
      { tool: "text", color: "#0A84FF", size: 4, text: "Hello", points: [{ x: 5, y: 6 }] },
    ]);
  });

  it("uses injected measurement for text bounds and hits", () => {
    const model = addText(createModel(), { color: "#FF3B30", size: 4, text: "Hello" }, { x: 5, y: 6 });
    const shape = model.shapes[0];

    expect(getBounds(shape, measureText)).toEqual({ minX: 5, minY: 6, maxX: 47, maxY: 24 });
    expect(hitsShape(shape, { x: 46, y: 23 }, measureText)).toBe(true);
    expect(hitsShape(shape, { x: 48, y: 23 }, measureText)).toBe(false);
  });

  it("moves, restyles, deletes, and restores text through existing transitions", () => {
    let model = addText(createModel(), { color: "#FF3B30", size: 4, text: "Hello" }, { x: 5, y: 6 });
    model = selectShape(model, 0);
    model = beginDrag(model, { x: 5, y: 6 });
    model = updateDrag(model, { x: 15, y: 16 });
    model = endDrag(model);
    expect(model.shapes[0]).toMatchObject({
      tool: "text",
      text: "Hello",
      color: "#FF3B30",
      size: 4,
      points: [{ x: 15, y: 16 }],
    });

    model = restyleSelected(model, { color: "#0A84FF", size: 8 });
    expect(model.shapes[0]).toMatchObject({ text: "Hello", color: "#0A84FF", size: 8 });

    model = deleteSelected(model);
    expect(model.shapes).toEqual([]);

    model = undo(model);
    expect(model.shapes[0]).toMatchObject({ tool: "text", text: "Hello" });
  });
});

describe("committed-layer invalidation (revision)", () => {
  const stroke: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ];

  it("does not change while a shape is in progress (layer can be reused per pointermove)", () => {
    let model = createModel();
    const before = model.revision;
    model = startShape(model, PEN, stroke[0]);
    model = updateShape(model, stroke[1], false);
    expect(model.revision).toBe(before);
  });

  it("changes when the committed set changes: commit, undo, redo, clear", () => {
    let model = drawStroke(createModel(), stroke);
    const afterCommit = model.revision;
    expect(afterCommit).not.toBe(createModel().revision);

    model = undo(model);
    const afterUndo = model.revision;
    expect(afterUndo).not.toBe(afterCommit);

    model = redo(model);
    const afterRedo = model.revision;
    expect(afterRedo).not.toBe(afterUndo);

    model = clearAll(model);
    expect(model.revision).not.toBe(afterRedo);
  });

  it("does not change on no-op transitions", () => {
    const empty = createModel();
    expect(undo(empty).revision).toBe(empty.revision);
    expect(redo(empty).revision).toBe(empty.revision);
    expect(clearAll(empty).revision).toBe(empty.revision);
    expect(commitShape(empty).revision).toBe(empty.revision);
  });
});

describe("discardCurrent (cancel in-progress)", () => {
  it("drops the in-progress shape without committing it or touching history", () => {
    let model = startShape(createModel(), PEN, { x: 1, y: 2 });
    model = updateShape(model, { x: 3, y: 4 }, false);
    const discarded = discardCurrent(model);
    expect(discarded.current).toBeNull();
    // The committed set, its cache revision, and undo/redo are all untouched.
    expect(discarded.shapes).toEqual([]);
    expect(discarded.revision).toBe(model.revision);
    expect(discarded.undoStack).toBe(model.undoStack);
    expect(discarded.redoStack).toBe(model.redoStack);
  });

  it("is a no-op when there is no in-progress shape", () => {
    const empty = createModel();
    expect(discardCurrent(empty)).toBe(empty);
  });

  it("leaves already-committed shapes and their undo history intact", () => {
    const committed = drawStroke(createModel(), [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const withCurrent = startShape(committed, PEN, { x: 8, y: 8 });
    const discarded = discardCurrent(withCurrent);
    expect(discarded.shapes).toEqual(committed.shapes);
    expect(discarded.undoStack).toBe(committed.undoStack);
    expect(canUndo(discarded)).toBe(true);
  });
});

describe("bounds", () => {
  it("returns null for a shape with no points", () => {
    const shape: Shape = { ...PEN, points: [] };
    expect(getBounds(shape)).toBeNull();
  });

  it("covers all stroke points padded by half the stroke width", () => {
    const shape: Shape = {
      ...PEN,
      size: 6,
      points: [
        { x: 10, y: 20 },
        { x: 40, y: 5 },
        { x: 25, y: 30 },
      ],
    };
    expect(getBounds(shape)).toEqual({ minX: 7, minY: 2, maxX: 43, maxY: 33 });
  });

  it("uses the widened highlighter band for padding", () => {
    const shape: Shape = {
      ...PEN,
      tool: "highlighter",
      size: 4,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    // Highlighter paints at size * 5 → pad 10.
    expect(getBounds(shape)).toEqual({ minX: -10, minY: -10, maxX: 20, maxY: 10 });
  });

  it("includes the arrowhead wings for arrows", () => {
    const shape: Shape = {
      ...PEN,
      tool: "arrow",
      size: 4,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const bounds = getBounds(shape);
    // Wings of a horizontal arrow extend headLen * sin(30°) = 7 above and below the shaft.
    expect(bounds).not.toBeNull();
    expect(bounds!.minY).toBeLessThanOrEqual(-7);
    expect(bounds!.maxY).toBeGreaterThanOrEqual(7);
  });
});
