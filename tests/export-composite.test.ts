import { describe, expect, it } from "vitest";

import { resolveExportScale } from "../renderer/overlay/export-composite";

describe("resolveExportScale", () => {
  it("maps a 1x display capture to logical overlay coordinates", () => {
    expect(resolveExportScale({ width: 1440, height: 900 }, { width: 1440, height: 900 })).toEqual({
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("maps a Retina capture to device-pixel coordinates", () => {
    expect(resolveExportScale({ width: 3024, height: 1964 }, { width: 1512, height: 982 })).toEqual(
      {
        scaleX: 2,
        scaleY: 2,
      },
    );
  });

  it("preserves non-uniform capture scaling", () => {
    expect(
      resolveExportScale({ width: 3000, height: 1800 }, { width: 1500, height: 1200 }),
    ).toEqual({
      scaleX: 2,
      scaleY: 1.5,
    });
  });

  it("rejects invalid sizes", () => {
    expect(() =>
      resolveExportScale({ width: 0, height: 100 }, { width: 100, height: 100 }),
    ).toThrow("positive finite");
    expect(() =>
      resolveExportScale({ width: 100, height: 100 }, { width: Number.NaN, height: 100 }),
    ).toThrow("positive finite");
  });
});
