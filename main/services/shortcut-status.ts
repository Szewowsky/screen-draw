/**
 * Pure registration-result state for the global toggle shortcut.
 *
 * Registration always unregisters the previous accelerator first, so a
 * failed attempt leaves no shortcut registered — the status reflects both
 * what is active and what the user should be warned about. No Electron
 * imports; unit testable in plain Node.
 */

export interface ShortcutStatus {
  /** The currently registered accelerator, or null when nothing is registered. */
  registeredAccelerator: string | null;
  /** The accelerator that failed to register, or null when there is nothing to warn about. */
  failedAccelerator: string | null;
}

export function initialShortcutStatus(): ShortcutStatus {
  return { registeredAccelerator: null, failedAccelerator: null };
}

/** The status after a registration attempt for `accelerator` finished with `ok`. */
export function recordRegistrationResult(accelerator: string, ok: boolean): ShortcutStatus {
  return ok
    ? { registeredAccelerator: accelerator, failedAccelerator: null }
    : { registeredAccelerator: null, failedAccelerator: accelerator };
}
