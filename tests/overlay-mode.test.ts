import { describe, expect, it } from "vitest";
import { nextMode, type OverlayMode } from "../main/services/overlay-mode";

describe("overlay mode transitions", () => {
  describe("toggle", () => {
    it("starts drawing from hidden", () => {
      expect(nextMode("hidden", "toggle")).toBe("drawing");
    });

    it("stops (hides) from drawing", () => {
      expect(nextMode("drawing", "toggle")).toBe("hidden");
    });

    it("resumes drawing from sticky (not hidden)", () => {
      // Sticky is a paused drawing session: the toggle control that
      // starts/stops drawing resumes it rather than hiding the pinned ink.
      expect(nextMode("sticky", "toggle")).toBe("drawing");
    });
  });

  describe("pin", () => {
    it("pins from drawing to sticky", () => {
      expect(nextMode("drawing", "pin")).toBe("sticky");
    });

    it("is a no-op from sticky (already pinned)", () => {
      expect(nextMode("sticky", "pin")).toBe("sticky");
    });

    it("is a no-op from hidden (nothing to pin)", () => {
      expect(nextMode("hidden", "pin")).toBe("hidden");
    });
  });

  it("only ever yields one of the three modes", () => {
    const modes: OverlayMode[] = ["drawing", "sticky", "hidden"];
    const valid = new Set<OverlayMode>(modes);
    for (const mode of modes) {
      expect(valid.has(nextMode(mode, "toggle"))).toBe(true);
      expect(valid.has(nextMode(mode, "pin"))).toBe(true);
    }
  });
});
