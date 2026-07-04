import { describe, expect, it } from "vitest";

import { resolveOverlayVisibility } from "../main/services/overlay-visibility";
import type { OverlayMode } from "../main/services/overlay-mode";

describe("overlay visibility resolution", () => {
  const modes: OverlayMode[] = ["hidden", "drawing", "sticky"];
  const effectsStates = [false, true];
  const activeDisplayStates = [false, true];

  it("covers every mode, effects, and active-display combination", () => {
    const rows = modes.flatMap((mode) =>
      effectsStates.flatMap((effectsActive) =>
        activeDisplayStates.map((isActiveDisplay) => ({
          key: `${mode}/${effectsActive ? "effects" : "no-effects"}/${
            isActiveDisplay ? "active-display" : "inactive-display"
          }`,
          value: resolveOverlayVisibility({ mode, effectsActive, isActiveDisplay }),
        })),
      ),
    );

    expect(rows).toHaveLength(12);
    expect(Object.fromEntries(rows.map((row) => [row.key, row.value]))).toEqual({
      "hidden/no-effects/inactive-display": {
        visible: false,
        ignoreMouse: true,
        focusBehavior: "none",
      },
      "hidden/no-effects/active-display": {
        visible: false,
        ignoreMouse: true,
        focusBehavior: "none",
      },
      "hidden/effects/inactive-display": {
        visible: true,
        ignoreMouse: true,
        focusBehavior: "inactive",
      },
      "hidden/effects/active-display": {
        visible: true,
        ignoreMouse: true,
        focusBehavior: "inactive",
      },
      "drawing/no-effects/inactive-display": {
        visible: true,
        ignoreMouse: false,
        focusBehavior: "inactive",
      },
      "drawing/no-effects/active-display": {
        visible: true,
        ignoreMouse: false,
        focusBehavior: "active",
      },
      "drawing/effects/inactive-display": {
        visible: true,
        ignoreMouse: false,
        focusBehavior: "inactive",
      },
      "drawing/effects/active-display": {
        visible: true,
        ignoreMouse: false,
        focusBehavior: "active",
      },
      "sticky/no-effects/inactive-display": {
        visible: true,
        ignoreMouse: true,
        focusBehavior: "inactive",
      },
      "sticky/no-effects/active-display": {
        visible: true,
        ignoreMouse: true,
        focusBehavior: "inactive",
      },
      "sticky/effects/inactive-display": {
        visible: true,
        ignoreMouse: true,
        focusBehavior: "inactive",
      },
      "sticky/effects/active-display": {
        visible: true,
        ignoreMouse: true,
        focusBehavior: "inactive",
      },
    });
  });
});
