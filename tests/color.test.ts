import { describe, expect, it } from "vitest";
import { normalizeHexColor } from "../renderer/overlay/color";

describe("normalizeHexColor", () => {
  it("accepts a 6-digit hex with a leading #", () => {
    expect(normalizeHexColor("#1A2B3C")).toBe("#1a2b3c");
  });

  it("accepts a 6-digit hex without a leading #", () => {
    expect(normalizeHexColor("1a2b3c")).toBe("#1a2b3c");
  });

  it("expands 3-digit shorthand, with or without #", () => {
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(normalizeHexColor("f0a")).toBe("#ff00aa");
  });

  it("normalizes to lowercase", () => {
    expect(normalizeHexColor("#FFFFFF")).toBe("#ffffff");
    expect(normalizeHexColor("000000")).toBe("#000000");
  });

  it("tolerates surrounding whitespace", () => {
    expect(normalizeHexColor("  #FF9500  ")).toBe("#ff9500");
  });

  it("rejects non-hex characters", () => {
    expect(normalizeHexColor("#12345g")).toBeNull();
    expect(normalizeHexColor("hello!")).toBeNull();
    expect(normalizeHexColor("rgb(1,2,3)")).toBeNull();
  });

  it("rejects wrong lengths", () => {
    expect(normalizeHexColor("#1234")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("#1234567")).toBeNull();
    expect(normalizeHexColor("ab")).toBeNull();
  });

  it("rejects empty or hash-only input", () => {
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("   ")).toBeNull();
    expect(normalizeHexColor("#")).toBeNull();
  });
});
