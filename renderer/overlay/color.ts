/**
 * Pure hex-color validation and normalization for the overlay color popover.
 *
 * No DOM or React imports — unit testable in plain Node. The popover's hex
 * input passes raw user text in and applies the normalized result.
 */

/**
 * Validate and normalize a hex color string.
 *
 * Accepts `#rrggbb`, `rrggbb`, `#rgb`, and `rgb` (leading `#` optional, any
 * case, surrounding whitespace tolerated). 3-digit shorthand is expanded.
 * Returns a lowercase `#rrggbb` string (matching the native color input's
 * output, so palette dedup and recent-color storage stay consistent), or
 * null when the input is not a valid hex color.
 */
export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(trimmed)) return null;
  if (trimmed.length === 3) {
    const [r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (trimmed.length === 6) {
    return `#${trimmed}`;
  }
  return null;
}
