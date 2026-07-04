import {
  addRecentColor,
  coerceSettings,
  type CursorHighlightSettings,
  type EffectsShortcuts,
  type ScreenDrawSettings,
  type SpotlightSettings,
  type ToolbarPosition,
  type ToolbarPositionByDisplay,
  type ToolbarPositionScope,
} from "./settings-schema.js";

export interface SettingsDefaultsPatch {
  defaultColor?: string;
  defaultSize?: number;
  /** null resets the toolbar to its default placement; undefined leaves it unchanged. */
  toolbarPosition?: ToolbarPosition | null;
  /** Active display for a toolbar position write; per-display mode updates this entry. */
  toolbarPositionDisplayId?: number | null;
  /** How toolbar positions are remembered across displays. */
  toolbarPositionScope?: ToolbarPositionScope;
  /** A custom color to record in the recent list (does not change the default color). */
  recentColor?: string;
  /** Toggle hiding the toolbar window from screen recordings; undefined leaves it unchanged. */
  hideToolbarInRecordings?: boolean;
  /** Flip hideToolbarInRecordings atomically (read-modify-write happens in the store). */
  toggleHideToolbarInRecordings?: boolean;
  cursorHighlight?: Partial<CursorHighlightSettings>;
  /** Flip cursorHighlight.enabled atomically (read-modify-write happens in the store). */
  toggleCursorHighlight?: boolean;
  spotlight?: Partial<SpotlightSettings>;
  /** Flip spotlight.enabled atomically (read-modify-write happens in the store). */
  toggleSpotlight?: boolean;
  effectsShortcuts?: Partial<EffectsShortcuts>;
}

export function applySettingsDefaults(
  current: ScreenDrawSettings,
  partial: SettingsDefaultsPatch,
): ScreenDrawSettings {
  const nextHideInRecordings = partial.toggleHideToolbarInRecordings
    ? !current.hideToolbarInRecordings
    : partial.hideToolbarInRecordings !== undefined
      ? partial.hideToolbarInRecordings
      : current.hideToolbarInRecordings;

  return coerceSettings({
    ...current,
    defaultColor: partial.defaultColor ?? current.defaultColor,
    defaultSize: partial.defaultSize ?? current.defaultSize,
    toolbarPosition:
      partial.toolbarPosition !== undefined &&
      (current.toolbarPositionScope === "shared" ||
        partial.toolbarPositionDisplayId === undefined ||
        partial.toolbarPositionDisplayId === null)
        ? partial.toolbarPosition
        : current.toolbarPosition,
    toolbarPositionScope: partial.toolbarPositionScope ?? current.toolbarPositionScope,
    toolbarPositionByDisplay:
      partial.toolbarPosition !== undefined &&
      current.toolbarPositionScope === "per-display" &&
      partial.toolbarPositionDisplayId !== undefined &&
      partial.toolbarPositionDisplayId !== null
        ? updateToolbarPositionByDisplay(
            current.toolbarPositionByDisplay,
            partial.toolbarPositionDisplayId,
            partial.toolbarPosition,
          )
        : current.toolbarPositionByDisplay,
    recentColors: partial.recentColor
      ? addRecentColor(current.recentColors, partial.recentColor)
      : current.recentColors,
    hideToolbarInRecordings: nextHideInRecordings,
    cursorHighlight: {
      ...current.cursorHighlight,
      ...partial.cursorHighlight,
      enabled: partial.toggleCursorHighlight
        ? !current.cursorHighlight.enabled
        : (partial.cursorHighlight?.enabled ?? current.cursorHighlight.enabled),
    },
    spotlight: {
      ...current.spotlight,
      ...partial.spotlight,
      enabled: partial.toggleSpotlight
        ? !current.spotlight.enabled
        : (partial.spotlight?.enabled ?? current.spotlight.enabled),
    },
    effectsShortcuts: {
      ...current.effectsShortcuts,
      ...partial.effectsShortcuts,
    },
  });
}

function updateToolbarPositionByDisplay(
  current: ToolbarPositionByDisplay,
  displayId: number,
  position: ToolbarPosition | null,
): ToolbarPositionByDisplay {
  const next = { ...current };
  const key = String(displayId);
  if (position === null) delete next[key];
  else next[key] = position;
  return next;
}
