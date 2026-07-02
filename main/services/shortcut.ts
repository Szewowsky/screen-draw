/**
 * Global shortcut registration for toggling drawing mode.
 *
 * A single accelerator toggles the overlay on/off. Re-registering unregisters
 * any previously registered shortcut first so the accelerator can be changed
 * at runtime.
 */

import { globalShortcut } from "electron";

import { toggleOverlay } from "../windows/overlay-window.js";
import { broadcast } from "./events.js";
import {
  initialShortcutStatus,
  recordRegistrationResult,
  type ShortcutStatus,
} from "./shortcut-status.js";
import { logger } from "../logger.js";

let status: ShortcutStatus = initialShortcutStatus();

export async function registerToggleShortcut(accelerator: string): Promise<boolean> {
  globalShortcut.unregisterAll();

  let ok = false;
  try {
    ok = await globalShortcut.register(accelerator, () => {
      void toggleOverlay({ triggerSource: "globalShortcut" });
    });

    if (ok) {
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

export function getShortcutStatus(): ShortcutStatus {
  return status;
}

export function getRegisteredShortcut(): string | null {
  return status.registeredAccelerator;
}
