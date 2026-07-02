import { describe, expect, it } from "vitest";
import {
  HIT_TOLERANCE,
  beginDrag,
  canRedo,
  canUndo,
  cancelDrag,
  commitShape,
  createModel,
  deleteSelected,
  draggedShape,
  endDrag,
  hitTest,
  redo,
  restyleSelected,
  selectShape,
  startShape,
  translateShape,
  undo,
  updateDrag,
  updateShape,
  type DrawingModel,
  type Point,
  type Shape,
} from "../renderer/overlay/drawing-model";
import type { DrawTool } from "../renderer/overlay/constants";

function shape(tool: DrawTool, points: Point[], size = 4): Shape {
  return { tool, color: "#FF3B30", size, points };
}

function modelWith(shapes: Shape[]): DrawingModel {
  let model = createModel();
  for (const s of shapes) {
    model = startShape(model, s, s.points[0]);
    for (const p of s.points.slice(1)) {
      model = updateShape(model, p, false);
    }
    model = commitShape(model);
  }
  return model;
}

const LINE = shape("line", [
  { x: 0, y: 50 },
  { x: 100, y: 50 },
]);
const RECT = shape("rectangle", [
  { x: 20, y: 20 },
  { x: 80, y: 80 },
]);

describe("hitTest", () => {
  it("hits a line on its stroke and misses far away", () => {
    expect(hitTest([LINE], { x: 50, y: 50 })).toBe(0);
    expect(hitTest([LINE], { x: 50, y: 90 })).toBeNull();
  });

  it("tolerates stroke thickness: a thin line is grabbable slightly off its path", () => {
    const thin = shape("line", LINE.points as Point[], 1);
    // 0.5px half-stroke alone would miss at 4px off; tolerance makes it hit.
    expect(hitTest([thin], { x: 50, y: 50 + HIT_TOLERANCE })).toBe(0);
    expect(hitTest([thin], { x: 50, y: 50 + HIT_TOLERANCE + 2 })).toBeNull();
  });

  it("hits the widened highlighter band", () => {
    const hl = shape("highlighter", LINE.points as Point[], 4);
    // Painted band is size * 5 = 20px wide → hits 10px off the path.
    expect(hitTest([hl], { x: 50, y: 60 })).toBe(0);
  });

  it("hits a rectangle on its border but not in its hollow interior", () => {
    expect(hitTest([RECT], { x: 20, y: 50 })).toBe(0);
    expect(hitTest([RECT], { x: 50, y: 50 })).toBeNull();
  });

  it("hits an ellipse on its outline but not at its center", () => {
    const ellipse = shape("ellipse", [
      { x: 0, y: 0 },
      { x: 100, y: 60 },
    ]);
    expect(hitTest([ellipse], { x: 100, y: 30 })).toBe(0); // right edge of outline
    expect(hitTest([ellipse], { x: 50, y: 30 })).toBeNull(); // center
  });

  it("hits a pen stroke along any of its segments", () => {
    const pen = shape("pen", [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]);
    expect(hitTest([pen], { x: 25, y: 0 })).toBe(0);
    expect(hitTest([pen], { x: 50, y: 25 })).toBe(0);
    expect(hitTest([pen], { x: 10, y: 40 })).toBeNull();
  });

  it("hits an arrow on its arrowhead barbs, not just the shaft", () => {
    const arrow = shape("arrow", [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    // Wing endpoint of a size-4 arrow is ~(88, 7): 7px off the shaft, beyond
    // the shaft radius (2 + tolerance 4 = 6), but on the painted barb.
    expect(hitTest([arrow], { x: 88, y: 7 })).toBe(0);
    expect(hitTest([arrow], { x: 88, y: -7 })).toBe(0);
    expect(hitTest([arrow], { x: 88, y: 15 })).toBeNull();
  });

  it("resolves overlapping shapes to the topmost (last painted)", () => {
    const bottom = shape("line", LINE.points as Point[]);
    const top = shape("line", LINE.points as Point[]);
    expect(hitTest([bottom, top], { x: 50, y: 50 })).toBe(1);
  });

  it("returns null on empty canvas", () => {
    expect(hitTest([], { x: 10, y: 10 })).toBeNull();
  });
});

describe("translateShape", () => {
  const kinds: DrawTool[] = ["pen", "highlighter", "line", "arrow", "rectangle", "ellipse"];

  it("moves every point of every shape kind", () => {
    for (const tool of kinds) {
      const s = shape(tool, [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 },
      ]);
      const moved = translateShape(s, 10, -5);
      expect(moved.points).toEqual([
        { x: 11, y: -3 },
        { x: 13, y: -1 },
        { x: 15, y: 1 },
      ]);
      expect(moved.tool).toBe(tool);
    }
  });

  it("returns the same shape for a zero translation", () => {
    const s = shape("pen", [{ x: 1, y: 2 }]);
    expect(translateShape(s, 0, 0)).toBe(s);
  });
});

describe("selection transitions", () => {
  it("selects a shape and deselects with null", () => {
    let model = modelWith([LINE, RECT]);
    model = selectShape(model, 1);
    expect(model.selectedIndex).toBe(1);
    model = selectShape(model, null);
    expect(model.selectedIndex).toBeNull();
  });

  it("ignores out-of-range indices", () => {
    const model = selectShape(modelWith([LINE]), 5);
    expect(model.selectedIndex).toBeNull();
  });

  it("clears selection on undo and redo (indices may be stale)", () => {
    let model = selectShape(modelWith([LINE, RECT]), 0);
    model = undo(model);
    expect(model.selectedIndex).toBeNull();
    model = selectShape(model, 0);
    model = redo(model);
    expect(model.selectedIndex).toBeNull();
  });
});

describe("move (drag)", () => {
  function dragBy(model: DrawingModel, index: number, dx: number, dy: number): DrawingModel {
    let next = selectShape(model, index);
    next = beginDrag(next, { x: 0, y: 0 });
    next = updateDrag(next, { x: dx, y: dy });
    return endDrag(next);
  }

  it("moves the selected shape and keeps it selected at its z-order position", () => {
    let model = modelWith([LINE, RECT]);
    model = dragBy(model, 0, 10, 20);
    expect(model.shapes[0].points).toEqual([
      { x: 10, y: 70 },
      { x: 110, y: 70 },
    ]);
    expect(model.shapes[1]).toEqual(RECT); // untouched, still topmost
    expect(model.selectedIndex).toBe(0);
    expect(model.drag).toBeNull();
  });

  it("lifts the shape out of the committed set while dragging and renders it via draggedShape", () => {
    let model = selectShape(modelWith([LINE]), 0);
    model = beginDrag(model, { x: 0, y: 0 });
    expect(model.shapes).toHaveLength(0);
    model = updateDrag(model, { x: 5, y: 5 });
    expect(draggedShape(model.drag!).points[0]).toEqual({ x: 5, y: 55 });
  });

  it("rebuilds the committed layer once at drag start, not per pointer move", () => {
    let model = selectShape(modelWith([LINE]), 0);
    const before = model.revision;
    model = beginDrag(model, { x: 0, y: 0 });
    const dragging = model.revision;
    expect(dragging).not.toBe(before);
    model = updateDrag(model, { x: 5, y: 5 });
    expect(model.revision).toBe(dragging);
  });

  it("is undoable and redoable", () => {
    let model = modelWith([LINE]);
    model = dragBy(model, 0, 10, 0);
    expect(model.shapes[0].points[0]).toEqual({ x: 10, y: 50 });

    model = undo(model);
    expect(model.shapes[0].points[0]).toEqual({ x: 0, y: 50 });

    model = redo(model);
    expect(model.shapes[0].points[0]).toEqual({ x: 10, y: 50 });
  });

  it("cancelDrag restores the pre-drag position with nothing recorded in history", () => {
    let model = modelWith([LINE, RECT]);
    const undoDepth = model.undoStack.length;
    model = selectShape(model, 0);
    model = beginDrag(model, { x: 0, y: 0 });
    model = updateDrag(model, { x: 200, y: 100 });
    model = cancelDrag(model);
    expect(model.drag).toBeNull();
    expect(model.shapes[0]).toEqual(LINE); // back at the original position
    expect(model.shapes[1]).toEqual(RECT);
    expect(model.selectedIndex).toBe(0);
    expect(model.undoStack).toHaveLength(undoDepth);
  });

  it("cancelDrag is a no-op when nothing is being dragged", () => {
    const model = selectShape(modelWith([LINE]), 0);
    expect(cancelDrag(model)).toBe(model);
  });

  it("records nothing in history for a zero-distance drag (plain selection click)", () => {
    let model = modelWith([LINE]);
    const undoDepth = model.undoStack.length;
    model = selectShape(model, 0);
    model = beginDrag(model, { x: 50, y: 50 });
    model = endDrag(model);
    expect(model.undoStack).toHaveLength(undoDepth);
    expect(model.shapes[0]).toEqual(LINE);
    expect(model.selectedIndex).toBe(0);
  });

  it("clears the redo stack when a move commits", () => {
    let model = modelWith([LINE, RECT]);
    model = undo(model);
    expect(canRedo(model)).toBe(true);
    model = dragBy(model, 0, 10, 0);
    expect(canRedo(model)).toBe(false);
  });
});

describe("delete", () => {
  it("removes the selected shape and clears the selection", () => {
    let model = selectShape(modelWith([LINE, RECT]), 0);
    model = deleteSelected(model);
    expect(model.shapes).toHaveLength(1);
    expect(model.shapes[0]).toEqual(RECT);
    expect(model.selectedIndex).toBeNull();
  });

  it("is undoable and redoable", () => {
    let model = selectShape(modelWith([LINE, RECT]), 1);
    model = deleteSelected(model);
    model = undo(model);
    expect(model.shapes).toHaveLength(2);
    model = redo(model);
    expect(model.shapes).toHaveLength(1);
  });

  it("is a no-op without a selection", () => {
    const model = modelWith([LINE]);
    expect(deleteSelected(model)).toBe(model);
    expect(canUndo(deleteSelected(createModel()))).toBe(false);
  });
});

describe("restyleSelected", () => {
  it("changes the selected shape's color, keeping selection and geometry", () => {
    let model = selectShape(modelWith([LINE, RECT]), 0);
    model = restyleSelected(model, { color: "#0A84FF" });
    expect(model.shapes[0].color).toBe("#0A84FF");
    expect(model.shapes[0].points).toEqual(LINE.points);
    expect(model.shapes[1]).toEqual(RECT); // untouched
    expect(model.selectedIndex).toBe(0);
  });

  it("changes the selected shape's size", () => {
    let model = selectShape(modelWith([LINE]), 0);
    model = restyleSelected(model, { size: 12 });
    expect(model.shapes[0].size).toBe(12);
    expect(model.selectedIndex).toBe(0);
  });

  it("changes color and size together in one operation", () => {
    let model = selectShape(modelWith([LINE]), 0);
    const undoDepth = model.undoStack.length;
    model = restyleSelected(model, { color: "#30D158", size: 8 });
    expect(model.shapes[0].color).toBe("#30D158");
    expect(model.shapes[0].size).toBe(8);
    expect(model.undoStack).toHaveLength(undoDepth + 1);
  });

  it("preserves the tool so a recolored highlighter stays a highlighter", () => {
    const hl = shape("highlighter", LINE.points as Point[], 4);
    let model = selectShape(modelWith([hl]), 0);
    model = restyleSelected(model, { color: "#FFD60A", size: 9 });
    expect(model.shapes[0].tool).toBe("highlighter");
    expect(model.shapes[0].color).toBe("#FFD60A");
    expect(model.shapes[0].size).toBe(9);
  });

  it("is a no-op (same reference) without a selection", () => {
    const model = modelWith([LINE]);
    expect(restyleSelected(model, { color: "#0A84FF" })).toBe(model);
  });

  it("is a no-op (same reference) mid-drag", () => {
    let model = selectShape(modelWith([LINE]), 0);
    model = beginDrag(model, { x: 0, y: 0 });
    expect(restyleSelected(model, { color: "#0A84FF" })).toBe(model);
  });

  it("is a no-op (same reference) when the values are unchanged", () => {
    const model = selectShape(modelWith([LINE]), 0);
    const same = restyleSelected(model, { color: LINE.color, size: LINE.size });
    expect(same).toBe(model);
  });

  it("is undoable and redoable, restoring the prior style round-trip", () => {
    let model = selectShape(modelWith([LINE]), 0);
    model = restyleSelected(model, { color: "#0A84FF", size: 10 });
    expect(model.shapes[0].color).toBe("#0A84FF");

    model = undo(model);
    expect(model.shapes[0].color).toBe(LINE.color);
    expect(model.shapes[0].size).toBe(LINE.size);

    model = redo(model);
    expect(model.shapes[0].color).toBe("#0A84FF");
    expect(model.shapes[0].size).toBe(10);
  });

  it("clears the redo stack on a new restyle", () => {
    let model = selectShape(modelWith([LINE, RECT]), 0);
    model = undo(model); // there's a redo available now
    expect(canRedo(model)).toBe(true);
    model = selectShape(model, 0);
    model = restyleSelected(model, { color: "#0A84FF" });
    expect(canRedo(model)).toBe(false);
  });

  it("coalesces a burst of same-field size changes into one undo entry", () => {
    let model = selectShape(modelWith([LINE]), 0);
    const undoDepth = model.undoStack.length;
    for (const s of [6, 7, 8, 9, 10]) {
      model = restyleSelected(model, { size: s }, { coalesce: true });
    }
    expect(model.shapes[0].size).toBe(10);
    expect(model.undoStack).toHaveLength(undoDepth + 1);
    // One undo returns to the pre-gesture size, not an intermediate value.
    model = undo(model);
    expect(model.shapes[0].size).toBe(LINE.size);
  });

  it("records separate entries for discrete (non-coalesced) changes", () => {
    let model = selectShape(modelWith([LINE]), 0);
    const undoDepth = model.undoStack.length;
    model = restyleSelected(model, { color: "#0A84FF" });
    model = restyleSelected(model, { color: "#30D158" });
    expect(model.undoStack).toHaveLength(undoDepth + 2);
  });

  it("does not merge a size change into a preceding color pick's entry", () => {
    let model = selectShape(modelWith([LINE]), 0);
    const undoDepth = model.undoStack.length;
    model = restyleSelected(model, { color: "#0A84FF" }); // discrete
    model = restyleSelected(model, { size: 10 }, { coalesce: true }); // different field
    expect(model.undoStack).toHaveLength(undoDepth + 2);
    // Undo peels off only the size change, leaving the recolor intact.
    model = undo(model);
    expect(model.shapes[0].size).toBe(LINE.size);
    expect(model.shapes[0].color).toBe("#0A84FF");
  });
});
