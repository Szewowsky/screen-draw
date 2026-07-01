/**
 * Global shortcut registration for toggling drawing mode.
 *
 * A single accelerator toggles the overlay on/off. Re-registering unregisters
 * any previously registered shortcut first so the accelerator can be changed
 * at runtime.
 */

import { globalShortcut } from "electron";

import { toggleOverlay } from "../windows/overlay-window.js";
import { logger } from "../logger.js";

let currentAccelerator: string | null = null;

export async function registerToggleShortcut(accelerator: string): Promise<boolean> {
  globalShortcut.unregisterAll();
  currentAccelerator = null;

  try {
    const ok = await globalShortcut.register(accelerator, () => {
      void toggleOverlay();
    });

    if (ok) {
      currentAccelerator = accelerator;
      logger.info("shortcut", `Registered toggle shortcut: ${accelerator}`);
    } else {
      logger.error("shortcut", `Failed to register toggle shortcut: ${accelerator}`);
    }

    return ok;
  } catch (error) {
    logger.error("shortcut", `Error registering toggle shortcut: ${accelerator}`, error);
    return false;
  }
}

export function getRegisteredShortcut(): string | null {
  return currentAccelerator;
}
