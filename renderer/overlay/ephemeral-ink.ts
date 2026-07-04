export const EPHEMERAL_HOLD_MS = 800;
export const EPHEMERAL_FADE_MS = 600;
export const EPHEMERAL_LIFETIME_MS = EPHEMERAL_HOLD_MS + EPHEMERAL_FADE_MS;

export interface EphemeralInk {
  readonly endedAt: number | null;
}

export function ephemeralAlpha(ink: EphemeralInk, now: number): number {
  if (ink.endedAt === null) return 1;
  const age = Math.max(0, now - ink.endedAt);
  if (age <= EPHEMERAL_HOLD_MS) return 1;
  if (age >= EPHEMERAL_LIFETIME_MS) return 0;
  return 1 - (age - EPHEMERAL_HOLD_MS) / EPHEMERAL_FADE_MS;
}

export function isEphemeralExpired(ink: EphemeralInk, now: number): boolean {
  return ink.endedAt !== null && now - ink.endedAt >= EPHEMERAL_LIFETIME_MS;
}

export function pruneExpiredEphemerals<T extends EphemeralInk>(
  ephemerals: T[],
  now: number,
): T[] {
  let firstExpired = -1;
  for (let i = 0; i < ephemerals.length; i++) {
    if (isEphemeralExpired(ephemerals[i], now)) {
      firstExpired = i;
      break;
    }
  }
  if (firstExpired === -1) return ephemerals;

  const next = ephemerals.slice(0, firstExpired);
  for (let i = firstExpired + 1; i < ephemerals.length; i++) {
    const ink = ephemerals[i];
    if (!isEphemeralExpired(ink, now)) next.push(ink);
  }
  return next;
}
