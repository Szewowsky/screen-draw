import { describe, expect, it } from "vitest";
import { pickAdoptableToolbarState } from "../main/services/toolbar-state-cache";

describe("pickAdoptableToolbarState", () => {
  it("picks tool, color, size, and vanishing from a full toolbar state", () => {
    expect(
      pickAdoptableToolbarState({
        tool: "arrow",
        color: "#0A84FF",
        size: 7,
        selectionStyle: { color: "#FF3B30", size: 12 },
        recentColors: ["#123456"],
        vanishing: true,
      }),
    ).toEqual({ tool: "arrow", color: "#0A84FF", size: 7, vanishing: true });
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

  it("ignores malformed vanishing values without rejecting the tool state", () => {
    const result = pickAdoptableToolbarState({
      tool: "pen",
      color: "#FF3B30",
      size: 4,
      vanishing: "true",
    });
    expect(result).toEqual({ tool: "pen", color: "#FF3B30", size: 4 });
    expect(result).not.toHaveProperty("vanishing");
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
