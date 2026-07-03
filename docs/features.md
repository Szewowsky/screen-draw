# Screen Draw — feature guide

User-facing documentation for every feature. Release history lives in [CHANGELOG.md](../CHANGELOG.md).

## Drawing mode

Toggle with the global shortcut (default **⌘⇧D**, configurable in the control panel), the control panel's button, or the tray menu. While active, transparent overlays cover every display and all input goes to Screen Draw; **Esc** exits (see Escape layering below).

The overlay and toolbar stay ready while hidden, and the toolbar is shown before macOS app focus is requested. This keeps the app-side activation path short, but activation feel is still verified manually on a physical display: the 1.6.2 automated matrix was green/inconclusive, while owner real-shortcut QA remains the final check after switching between apps.

**Multi-display:** each display has its own canvas — shapes belong to the display they were drawn on. Moving the cursor onto a display makes it active: the toolbar and keyboard shortcuts follow the pointer. Undo/redo apply to the active display. In the control panel's **Toolbar** section, **Toolbar on other displays** chooses whether the toolbar uses the same saved position everywhere (default) or remembers a separate position per display.

## Three states: drawing, pinned, hidden

Screen Draw is in one of three states:

- **Drawing** — the normal interactive state above: overlays cover every display, the toolbar is visible, and `⌘Z`/`⌘⇧Z` and the single-key shortcuts drive the canvas.
- **Pinned (sticky)** — press the toolbar's **pin** button or `S`. Your annotations stay on screen (and in recordings) but the overlay becomes **click-through**: you click, type, and scroll in your normal apps straight through the drawings. The toolbar hides and `⌘Z` and every other key go back to those apps. Nothing is erased — the shapes, your selection, and the undo history are kept, and pinning never wipes the canvas even with [session ink](#session-ink-duszek--g) on. Any in-progress stroke and the selection indicator are cleared first, so nothing dashed floats over your work.
- **Hidden** — off. Nothing on screen.

**Resuming from pinned:** the global shortcut, the tray's **Toggle Drawing**, and the control panel button all return you to drawing with everything intact — the panel button reads **Resume drawing** while pinned. A normal exit from drawing (`Esc` or **Stop drawing**) still goes all the way to hidden; with [session ink](#session-ink-duszek--g) on that also wipes the canvas to a clean slate, whereas pinning is an alternative exit that always leaves the annotations up.

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

Toggle with the ghost button in the toolbar or `G`. While it's on, **drawing works exactly like normal** — every stroke commits to the canvas and is selectable (`V`), restylable, movable, deletable, and fully undoable/redoable with `⌘Z`. The only difference: when you **fully exit** drawing (`Esc`, **Stop drawing**, or the global toggle) with session ink on, the canvas **and** undo history reset to a clean slate, so the next time you start drawing you begin fresh. **Pinning (`S`) does not wipe** — pinned annotations stay on screen. Turn session ink off and everything persists across hide/show exactly as it always has. The toggle is remembered for the whole app session.

Made for live streams and tutorials: annotate freely during a segment, then just stop drawing to wipe the slate before the next one — no manual clearing, and everything stays editable while you work.

## Undo / redo / clear

- **⌘Z** undo, **⌘⇧Z** redo — work globally while drawing (registered as system-wide shortcuts). Moves, deletes, and clear-all are undoable; history holds the last 100 operations per display.
- **`C`** clears the active display's canvas (undoable).

## Escape layering

One `Esc` does the most local thing first:
1. Closes the color popover (if open).
2. Cancels an in-progress move — the shape snaps back.
3. Deselects the selected shape.
4. Exits drawing mode.

## The floating toolbar

A separate always-on-top bar on the active display, draggable by its grip; the position persists across restarts (off-screen positions reset to the default bottom-center). The control panel can keep one shared toolbar position across displays or remember positions per display. In per-display mode, dragging stores the active display's position and `⇧T` clears only that display's saved position; shared mode keeps `⇧T` clearing the shared position.

Hover any toolbar control to see its name and shortcut where a shortcut exists.

| Action | Key |
|---|---|
| Pin annotations (sticky, click-through) | `S` |
| Hide / show the toolbar (this session) | `T` |
| Reset toolbar to the default position (shared, or active display in per-display mode) | `⇧T` |
| Toggle "hidden in screen recordings" | `⇧R` |

**Hidden in recordings**: with the setting on (the toolbar's recordings button, Settings window, or `⇧R`), the toolbar window gets macOS content protection — you see it on the physical screen, but screen recorders (QuickTime, OBS) and screen sharing don't capture it. Your drawings are always captured. The toolbar carries a recordings button that lights up while the setting is on, so you can tell at a glance whether the bar is being captured; it, `⇧R`, and the Settings window all stay in sync.

## App presence

Screen Draw is a menu-bar app: no Dock icon. The tray (menu bar) icon offers Show Control Panel, Toggle Drawing, Settings…, and Quit.

## Settings & persistence

Stored in `~/Library/Application Support/Screen Draw/screen-draw-settings.json`: activation shortcut, default color/size, toolbar position scope, shared/per-display toolbar positions, recent colors, and the recordings-hide flag. Old settings files from previous versions load cleanly.
