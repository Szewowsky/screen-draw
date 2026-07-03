import { describe, expect, it } from "vitest";
import {
  EPHEMERAL_FADE_MS,
  EPHEMERAL_HOLD_MS,
  EPHEMERAL_LIFETIME_MS,
  ephemeralAlpha,
  pruneExpiredEphemerals,
} from "../renderer/overlay/ephemeral-ink";

describe("ephemeral ink timing", () => {
  it("stays fully opaque while a stroke is still being drawn", () => {
    expect(ephemeralAlpha({ endedAt: null }, 1234)).toBe(1);
  });

  it("stays fully opaque at release and through the hold window", () => {
    const ink = { endedAt: 1000 };

    expect(ephemeralAlpha(ink, 1000)).toBe(1);
    expect(ephemeralAlpha(ink, 1000 + EPHEMERAL_HOLD_MS)).toBe(1);
  });

  it("fades linearly after the hold window", () => {
    const ink = { endedAt: 1000 };
    const midFade = 1000 + EPHEMERAL_HOLD_MS + EPHEMERAL_FADE_MS / 2;

    expect(ephemeralAlpha(ink, midFade)).toBeCloseTo(0.5);
  });

  it("is transparent at expiry", () => {
    const ink = { endedAt: 1000 };

    expect(ephemeralAlpha(ink, 1000 + EPHEMERAL_LIFETIME_MS)).toBe(0);
  });

  it("prunes expired strokes and keeps active ones", () => {
    const fresh = { endedAt: null, id: "fresh" };
    const holding = { endedAt: 1001, id: "holding" };
    const faded = { endedAt: 1000, id: "faded" };

    expect(pruneExpiredEphemerals([fresh, holding, faded], 1000 + EPHEMERAL_LIFETIME_MS)).toEqual([
      fresh,
      holding,
    ]);
  });
});
