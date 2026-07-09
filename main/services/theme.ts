export type ThemeSource = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export interface EffectiveThemePayload {
  effectiveTheme: EffectiveTheme;
}

export interface NativeThemeInfo extends EffectiveThemePayload {
  themeSource: ThemeSource;
  shouldUseDarkColors: boolean;
}

export function isThemeSource(value: unknown): value is ThemeSource {
  return value === "system" || value === "light" || value === "dark";
}

export function readEffectiveTheme(payload: unknown): EffectiveTheme | null {
  if (payload === "light" || payload === "dark") return payload;
  if (typeof payload !== "object" || payload === null) return null;
  const theme = (payload as { effectiveTheme?: unknown }).effectiveTheme;
  return theme === "light" || theme === "dark" ? theme : null;
}

/** Resolve an explicit or system-following theme without Electron or DOM dependencies. */
export function resolveEffectiveTheme(
  themeSource: ThemeSource,
  systemPrefersDark: boolean,
): EffectiveTheme {
  return themeSource === "system" ? (systemPrefersDark ? "dark" : "light") : themeSource;
}
