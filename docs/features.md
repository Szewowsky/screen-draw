# Screen Draw — feature guide

User-facing documentation for every feature. Release history lives in [CHANGELOG.md](../CHANGELOG.md).

## Drawing mode

Toggle with the global shortcut (default **⌘⇧D**, configurable in the control panel), the control panel's button, or the tray menu. While active, transparent overlays cover every display and all input goes to Screen Draw; **Esc** exits (see Escape layering below).

**Multi-display:** each display has its own canvas — shapes belong to the display they were drawn on. Moving the cursor onto a display makes it active: the toolbar and keyboard shortcuts follow the pointer. Undo/redo apply to the active display.

## Tools

| Tool | Key | Notes |
|---|---|---|
| Select & move | `V` | Click selects the topmost shape (generous hit area incl. arrowheads); drag moves it; `⌫`/`Delete` removes it. Click empty canvas to deselect. While selected, the toolbar mirrors the shape's color/size — a color swatch (or `1`–`6`), the popover, or the size slider (or `[`/`]`) restyles the selection instead of the new-stroke defaults (undoable; deselect restores your defaults). |
| Pen | `P` | Freehand. Hold `⇧` for a straight line. |
| Highlighter | `H` | Wide translucent band. Hold `⇧` for a straight line. |
| Line | `L` | Hold `⇧` to snap to 45° angles. |
| Arrow | `A` | Hold `⇧` to snap to 45° angles. |
| Rectangle | `R` | Hold `⇧` for a square. |
| Ellipse | `O` | Hold `⇧` for a circle. |

Brush size: `[` / `]` or the toolbar slider (1–24 px).

## Colors

- **Palette**: six swatches, keys `1`–`6`.
- **Custom colors**: click the color square in the toolbar to open the **color popover** — 15 presets, your recent colors, and a **hex input** (`#rrggbb` or `rrggbb`, also 3-digit). `Enter` applies; `Esc` or clicking elsewhere closes.
- **Recent colors**: the last 4 custom colors persist across restarts and appear next to the palette in the toolbar and in the control panel's default-color picker.

## Session ink („duszek") — `G`

Toggle with the ghost button in the toolbar or `G`. While on, everything you draw (any tool) stays on screen at full opacity for the whole drawing session — no auto-fade, no timer. Session-ink strokes never enter undo history (so `⌘Z` skips them); `C` (clear all) wipes them along with committed shapes, and they also vanish when you exit drawing mode. Turning the mode off leaves existing session ink on screen; new strokes just commit normally again. The toggle is remembered for the whole app session.

Made for live streams and tutorials: sketch quick throwaway marks that persist while you talk, then clear the lot with `C` when you're done — without cluttering undo history.

## Undo / redo / clear

- **⌘Z** undo, **⌘⇧Z** redo — work globally while drawing (registered as system-wide shortcuts). Moves, deletes, and clear-all are undoable; history holds the last 100 operations per display.
- **`C`** clears the active display's canvas (undoable; also wipes session ink).

## Escape layering

One `Esc` does the most local thing first:
1. Closes the color popover (if open).
2. Cancels an in-progress move — the shape snaps back.
3. Deselects the selected shape.
4. Exits drawing mode.

## The floating toolbar

A separate always-on-top bar on the active display, draggable by its grip; the position persists across restarts (off-screen positions reset to the default bottom-center).

| Action | Key |
|---|---|
| Hide / show the toolbar (this session) | `T` |
| Reset toolbar to the default position | `⇧T` |
| Toggle "hidden in screen recordings" | `⇧R` |

**Hidden in recordings**: with the setting on (the toolbar's recordings button, Settings window, or `⇧R`), the toolbar window gets macOS content protection — you see it on the physical screen, but screen recorders (QuickTime, OBS) and screen sharing don't capture it. Your drawings are always captured. The toolbar carries a recordings button that lights up while the setting is on, so you can tell at a glance whether the bar is being captured; it, `⇧R`, and the Settings window all stay in sync.

## App presence

Screen Draw is a menu-bar app: no Dock icon. The tray (menu bar) icon offers Show Control Panel, Toggle Drawing, Settings…, and Quit.

## Settings & persistence

Stored in `~/Library/Application Support/Screen Draw/screen-draw-settings.json`: activation shortcut, default color/size, toolbar position, recent colors, and the recordings-hide flag. Old settings files from previous versions load cleanly.
