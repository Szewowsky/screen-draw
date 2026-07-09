import { readEffectiveTheme } from "../main/services/theme";

function applyEffectiveTheme(payload: unknown): void {
  const theme = readEffectiveTheme(payload);
  if (theme) document.documentElement.dataset.theme = theme;
}

/** Apply the initial resolved theme and follow main-process broadcasts for this chrome window. */
export function initializeTheme(): void {
  window.screenDraw.ipc.on("nativeTheme:updated", applyEffectiveTheme);
  void window.screenDraw.nativeTheme.getInfo().then(applyEffectiveTheme);
}
