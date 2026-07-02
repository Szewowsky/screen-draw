/**
 * Pure hold/fade/prune math for vanishing ink — no DOM, React, or Electron, so
 * the module is unit testable in plain Node.
 *
 * A finished stroke drawn while vanishing ink is enabled is not committed to the
 * drawing model or its undo history. Instead it becomes an `Ephemeral`, stamped
 * with the time it was created: it holds fully opaque for `EPHEMERAL_HOLD_MS`,
 * fades to nothing over `EPHEMERAL_FADE_MS`, then is pruned. The overlay owns
 * the wall clock and passes timestamps in; nothing here reads a clock.
 */

import type { Shape } from "./drawing-model";

/** How long a finished ephemeral shape stays fully opaque before fading. */
export const EPHEMERAL_HOLD_MS = 2000;

/** How long the fade from opaque to fully transparent takes after the hold. */
export const EPHEMERAL_FADE_MS = 800;

/** Total lifetime of an ephemeral shape (hold + fade), after which it is pruned. */
export const EPHEMERAL_LIFETIME_MS = EPHEMERAL_HOLD_MS + EPHEMERAL_FADE_MS;

export interface Ephemeral {
  readonly shape: Shape;
  /** Timestamp (same clock as `pruneEphemerals`/`ephemeralAlpha` ages) of creation. */
  readonly createdAt: number;
}

/** Append a new ephemeral for `shape`, stamped `now`. Returns a new list. */
export function addEphemeral(
  list: readonly Ephemeral[],
  shape: Shape,
  now: number,
): readonly Ephemeral[] {
  return [...list, { shape, createdAt: now }];
}

/**
 * Opacity multiplier for an ephemeral of age `ageMs`: 1 while holding, a linear
 * ramp to 0 across the fade window, and 0 once expired. Clamped to [0, 1].
 */
export function ephemeralAlpha(ageMs: number): number {
  if (ageMs <= EPHEMERAL_HOLD_MS) return 1;
  if (ageMs >= EPHEMERAL_LIFETIME_MS) return 0;
  return 1 - (ageMs - EPHEMERAL_HOLD_MS) / EPHEMERAL_FADE_MS;
}

/** Drop ephemerals whose lifetime has elapsed by `now`; keep the still-live ones. */
export function pruneEphemerals(list: readonly Ephemeral[], now: number): readonly Ephemeral[] {
  const live = list.filter((e) => now - e.createdAt < EPHEMERAL_LIFETIME_MS);
  return live.length === list.length ? list : live;
}
