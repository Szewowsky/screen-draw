import { describe, expect, it } from "vitest";
import {
  EPHEMERAL_FADE_MS,
  EPHEMERAL_HOLD_MS,
  EPHEMERAL_LIFETIME_MS,
  addEphemeral,
  ephemeralAlpha,
  pruneEphemerals,
  type Ephemeral,
} from "../renderer/overlay/ephemeral";
import type { Shape } from "../renderer/overlay/drawing-model";

const shape = (): Shape => ({
  tool: "pen",
  color: "#ff3b30",
  size: 4,
  points: [{ x: 0, y: 0 }],
});

describe("addEphemeral", () => {
  it("appends a new entry stamped with the creation time", () => {
    const list = addEphemeral([], shape(), 1000);
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe(1000);
    expect(list[0].shape.tool).toBe("pen");
  });

  it("does not mutate the input list and preserves order", () => {
    const first = addEphemeral([], shape(), 100);
    const second = addEphemeral(first, shape(), 200);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second.map((e) => e.createdAt)).toEqual([100, 200]);
  });
});

describe("ephemeralAlpha", () => {
  it("is fully opaque throughout the hold window", () => {
    expect(ephemeralAlpha(0)).toBe(1);
    expect(ephemeralAlpha(EPHEMERAL_HOLD_MS / 2)).toBe(1);
    expect(ephemeralAlpha(EPHEMERAL_HOLD_MS)).toBe(1);
  });

  it("decreases monotonically across the fade window", () => {
    let prev = ephemeralAlpha(EPHEMERAL_HOLD_MS);
    for (let t = EPHEMERAL_HOLD_MS + 50; t < EPHEMERAL_LIFETIME_MS; t += 50) {
      const alpha = ephemeralAlpha(t);
      expect(alpha).toBeLessThan(prev);
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(1);
      prev = alpha;
    }
  });

  it("reaches roughly half opacity at the fade midpoint", () => {
    expect(ephemeralAlpha(EPHEMERAL_HOLD_MS + EPHEMERAL_FADE_MS / 2)).toBeCloseTo(0.5, 5);
  });

  it("is 0 at and after the end of life", () => {
    expect(ephemeralAlpha(EPHEMERAL_LIFETIME_MS)).toBe(0);
    expect(ephemeralAlpha(EPHEMERAL_LIFETIME_MS + 500)).toBe(0);
  });
});

describe("pruneEphemerals", () => {
  const build = (createdAts: number[]): Ephemeral[] =>
    createdAts.map((createdAt) => ({ shape: shape(), createdAt }));

  it("keeps entries that are still within their lifetime", () => {
    const list = build([0]);
    // Just before expiry the entry survives.
    expect(pruneEphemerals(list, EPHEMERAL_LIFETIME_MS - 1)).toBe(list);
  });

  it("removes entries whose lifetime has elapsed", () => {
    const list = build([0]);
    expect(pruneEphemerals(list, EPHEMERAL_LIFETIME_MS)).toHaveLength(0);
  });

  it("keeps live entries while dropping expired ones", () => {
    const now = 5000;
    const list = build([now - EPHEMERAL_LIFETIME_MS - 10, now - 100]);
    const pruned = pruneEphemerals(list, now);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].createdAt).toBe(now - 100);
  });

  it("returns the same reference when nothing is pruned", () => {
    const list = build([1000, 1100]);
    expect(pruneEphemerals(list, 1200)).toBe(list);
  });
});
