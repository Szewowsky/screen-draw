/**
 * Global shortcut registration for toggling drawing mode.
 *
 * A single accelerator toggles the overlay on/off. Re-registering unregisters
 * any previously registered shortcut first so the accelerator can be changed
 * at runtime.
 */

import { globalShortcut } from "electron";

import { syncOverlayEffectsFromSettings, toggleOverlay } from "../windows/overlay-window.js";
import { setDefaults, type EffectsShortcuts } from "./settings-store.js";
import { broadcast } from "./events.js";
import {
  initialShortcutStatus,
  recordRegistrationResult,
  type ShortcutStatus,
} from "./shortcut-status.js";
import { logger } from "../logger.js";

let status: ShortcutStatus = initialShortcutStatus();
let toggleAccelerator: string | null = null;
let effectAccelerators: EffectsShortcuts = {};
let effectsStatus: Record<keyof EffectsShortcuts, ShortcutStatus> = {
  highlight: initialShortcutStatus(),
  spotlight: initialShortcutStatus(),
};

export async function registerToggleShortcut(accelerator: string): Promise<boolean> {
  if (toggleAccelerator) {
    globalShortcut.unregister(toggleAccelerator);
    toggleAccelerator = null;
  }

  let ok = false;
  try {
    ok = await globalShortcut.register(accelerator, () => {
      void toggleOverlay({ triggerSource: "globalShortcut" });
    });

    if (ok) {
      toggleAccelerator = accelerator;
      logger.info("shortcut", `Registered toggle shortcut: ${accelerator}`);
    } else {
      logger.error("shortcut", `Failed to register toggle shortcut: ${accelerator}`);
    }
  } catch (error) {
    logger.error("shortcut", `Error registering toggle shortcut: ${accelerator}`, error);
  }

  status = recordRegistrationResult(accelerator, ok);
  // Surface the result in the control panel (registration also happens at startup).
  broadcast("shortcut:status-changed", status);
  return ok;
}

async function toggleEffect(kind: keyof EffectsShortcuts): Promise<void> {
  const next = setDefaults(
    kind === "highlight" ? { toggleCursorHighlight: true } : { toggleSpotlight: true },
  );
  await syncOverlayEffectsFromSettings();
  broadcast("settings:changed", next);
}

function unregisterEffectShortcuts(): void {
  for (const accelerator of Object.values(effectAccelerators)) {
    if (accelerator) globalShortcut.unregister(accelerator);
  }
  effectAccelerators = {};
}

export async function registerEffectsShortcuts(shortcuts: EffectsShortcuts): Promise<void> {
  unregisterEffectShortcuts();
  effectsStatus = {
    highlight: initialShortcutStatus(),
    spotlight: initialShortcutStatus(),
  };

  for (const kind of ["highlight", "spotlight"] as const) {
    const accelerator = shortcuts[kind];
    if (!accelerator) continue;
    let ok = false;
    try {
      ok = await globalShortcut.register(accelerator, () => {
        void toggleEffect(kind);
      });
      if (ok) {
        effectAccelerators[kind] = accelerator;
        logger.info("shortcut", `Registered ${kind} effect shortcut: ${accelerator}`);
      } else {
        logger.error("shortcut", `Failed to register ${kind} effect shortcut: ${accelerator}`);
      }
    } catch (error) {
      logger.error("shortcut", `Error registering ${kind} effect shortcut: ${accelerator}`, error);
    }
    effectsStatus[kind] = recordRegistrationResult(accelerator, ok);
  }

  broadcast("effects-shortcuts:status-changed", effectsStatus);
}

export function getEffectsShortcutStatus(): Record<keyof EffectsShortcuts, ShortcutStatus> {
  return effectsStatus;
}

export function getShortcutStatus(): ShortcutStatus {
  return status;
}

export function getRegisteredShortcut(): string | null {
  return status.registeredAccelerator;
}
