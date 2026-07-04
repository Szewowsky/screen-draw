import type { OverlayMode } from "./overlay-mode.js";

export type OverlayFocusBehavior = "active" | "inactive" | "none";

export interface OverlayVisibilityInput {
  mode: OverlayMode;
  effectsActive: boolean;
  isActiveDisplay: boolean;
}

export interface OverlayVisibility {
  visible: boolean;
  ignoreMouse: boolean;
  focusBehavior: OverlayFocusBehavior;
}

export function resolveOverlayVisibility(input: OverlayVisibilityInput): OverlayVisibility {
  if (input.mode === "drawing") {
    return {
      visible: true,
      ignoreMouse: false,
      focusBehavior: input.isActiveDisplay ? "active" : "inactive",
    };
  }

  if (input.mode === "sticky") {
    return {
      visible: true,
      ignoreMouse: true,
      focusBehavior: "inactive",
    };
  }

  if (input.effectsActive) {
    return {
      visible: true,
      ignoreMouse: true,
      focusBehavior: "inactive",
    };
  }

  return {
    visible: false,
    ignoreMouse: true,
    focusBehavior: "none",
  };
}
