import { describe, expect, it } from "vitest";
import { pickAdoptableToolbarState } from "../main/services/toolbar-state-cache";

describe("pickAdoptableToolbarState", () => {
  it("picks only tool, color, and size from a full toolbar state", () => {
    expect(
      pickAdoptableToolbarState({
        tool: "arrow",
        color: "#0A84FF",
        size: 7,
        selectionStyle: { color: "#FF3B30", size: 12 },
        recentColors: ["#123456"],
        vanishing: true,
      }),
    ).toEqual({ tool: "arrow", color: "#0A84FF", size: 7 });
  });

  it("accepts the select tool without adopting selection state", () => {
    expect(
      pickAdoptableToolbarState({
        tool: "select",
        color: "#FF3B30",
        size: 4,
        selectionStyle: { color: "#30D158", size: 18 },
      }),
    ).toEqual({ tool: "select", color: "#FF3B30", size: 4 });
  });

  it("rejects missing or malformed adoptable fields", () => {
    for (const raw of [
      null,
      [],
      { tool: "eraser", color: "#FF3B30", size: 4 },
      { tool: "pen", color: "", size: 4 },
      { tool: "pen", color: "#FF3B30", size: 0 },
      { tool: "pen", color: "#FF3B30", size: Number.NaN },
    ]) {
      expect(pickAdoptableToolbarState(raw)).toBeNull();
    }
  });
});
