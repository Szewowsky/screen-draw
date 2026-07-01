import { describe, expect, it } from "vitest";
import {
  TOOLBAR_HEIGHT,
  TOOLBAR_MIN_VISIBLE_WIDTH,
  clampToolbarPosition,
  sanitizeToolbarPosition,
} from "../renderer/overlay/toolbar-prefs";

const VIEWPORT = { width: 1440, height: 900 };

describe("sanitizeToolbarPosition", () => {
  it("accepts a position inside the viewport", () => {
    expect(sanitizeToolbarPosition({ x: 100, y: 200 }, VIEWPORT)).toEqual({ x: 100, y: 200 });
  });

  it("falls back to default placement for unset or malformed values", () => {
    for (const pos of [null, undefined, "100,200", { x: "100", y: 200 }, { x: 100 }, {}]) {
      expect(sanitizeToolbarPosition(pos, VIEWPORT)).toBeNull();
    }
  });

  it("rejects non-finite coordinates", () => {
    expect(sanitizeToolbarPosition({ x: NaN, y: 10 }, VIEWPORT)).toBeNull();
    expect(sanitizeToolbarPosition({ x: 10, y: Infinity }, VIEWPORT)).toBeNull();
  });

  it("falls back when the position is off-screen after a display change", () => {
    // Stored on a wide external display, restored on a smaller built-in one.
    expect(sanitizeToolbarPosition({ x: 2500, y: 100 }, VIEWPORT)).toBeNull();
    expect(sanitizeToolbarPosition({ x: 100, y: 1600 }, VIEWPORT)).toBeNull();
    expect(sanitizeToolbarPosition({ x: -50, y: 100 }, VIEWPORT)).toBeNull();
  });

  it("accepts positions up to the visibility margin at the edges", () => {
    const edge = {
      x: VIEWPORT.width - TOOLBAR_MIN_VISIBLE_WIDTH,
      y: VIEWPORT.height - TOOLBAR_HEIGHT,
    };
    expect(sanitizeToolbarPosition(edge, VIEWPORT)).toEqual(edge);
  });
});

describe("clampToolbarPosition", () => {
  it("keeps an in-bounds position unchanged", () => {
    expect(clampToolbarPosition({ x: 300, y: 400 }, VIEWPORT)).toEqual({ x: 300, y: 400 });
  });

  it("clamps a dragged position back into the reachable area", () => {
    expect(clampToolbarPosition({ x: -80, y: -20 }, VIEWPORT)).toEqual({ x: 0, y: 0 });
    expect(clampToolbarPosition({ x: 5000, y: 5000 }, VIEWPORT)).toEqual({
      x: VIEWPORT.width - TOOLBAR_MIN_VISIBLE_WIDTH,
      y: VIEWPORT.height - TOOLBAR_HEIGHT,
    });
  });

  it("clamped output always passes sanitization", () => {
    const clamped = clampToolbarPosition({ x: 99999, y: -99999 }, VIEWPORT);
    expect(sanitizeToolbarPosition(clamped, VIEWPORT)).toEqual(clamped);
  });
});
