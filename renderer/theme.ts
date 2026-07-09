type EffectiveTheme = "light" | "dark";

function readEffectiveTheme(payload: unknown): EffectiveTheme | null {
  if (payload === "light" || payload === "dark") return payload;
  if (typeof payload !== "object" || payload === null) return null;
  const theme = (payload as { effectiveTheme?: unknown }).effectiveTheme;
  return theme === "light" || theme === "dark" ? theme : null;
}

function applyEffectiveTheme(payload: unknown): void {
  const theme = readEffectiveTheme(payload);
  if (theme) document.documentElement.dataset.theme = theme;
}

/** Apply the initial resolved theme and follow main-process broadcasts for this chrome window. */
export function initializeTheme(): void {
  window.screenDraw.ipc.on("nativeTheme:updated", applyEffectiveTheme);
  void window.screenDraw.nativeTheme.getInfo().then(applyEffectiveTheme);
}
