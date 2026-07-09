export type ThemeSource = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

/** Resolve an explicit or system-following theme without Electron or DOM dependencies. */
export function resolveEffectiveTheme(
  themeSource: ThemeSource,
  systemPrefersDark: boolean,
): EffectiveTheme {
  return themeSource === "system" ? (systemPrefersDark ? "dark" : "light") : themeSource;
}
