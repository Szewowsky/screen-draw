import { describe, expect, it } from "vitest";
import { freehandPathCommands } from "../renderer/overlay/smooth-path";

describe("freehandPathCommands", () => {
  it("returns no commands for an empty path", () => {
    expect(freehandPathCommands([])).toEqual([]);
  });

  it("renders a single point as a tiny dot segment", () => {
    expect(freehandPathCommands([{ x: 4, y: 5 }])).toEqual([
      { type: "moveTo", point: { x: 4, y: 5 } },
      { type: "lineTo", point: { x: 4.1, y: 5 } },
    ]);
  });

  it("keeps two-point strokes as a straight segment", () => {
    expect(
      freehandPathCommands([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toEqual([
      { type: "moveTo", point: { x: 0, y: 0 } },
      { type: "lineTo", point: { x: 10, y: 0 } },
    ]);
  });

  it("smooths longer strokes with midpoint quadratic commands", () => {
    expect(
      freehandPathCommands([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
        { x: 30, y: 10 },
      ]),
    ).toEqual([
      { type: "moveTo", point: { x: 0, y: 0 } },
      { type: "quadraticCurveTo", control: { x: 10, y: 10 }, end: { x: 15, y: 5 } },
      { type: "quadraticCurveTo", control: { x: 20, y: 0 }, end: { x: 25, y: 5 } },
      { type: "lineTo", point: { x: 30, y: 10 } },
    ]);
  });
});
