# Changelog

All notable changes to Screen Draw are documented here. Feature descriptions live in [docs/features.md](docs/features.md).

## [Unreleased]

### Added
- **Pin annotations (sticky mode)** — the toolbar's pin button or `S` pins what you've drawn: the annotations stay on screen (and in recordings) but the overlay becomes click-through, the toolbar hides, and `⌘Z` and every key go back to your normal apps. It's a third state between drawing and hidden. Resume with the global shortcut, the tray's **Toggle Drawing**, or the control panel — your shapes, selection, and undo history are intact; the panel button reads **Resume drawing** while pinned. A normal exit (`Esc` / **Stop drawing**) still hides everything and clears session ink.

### Changed
- **Session ink** (`G`, formerly "vanishing ink"): ghost strokes now stay on screen at full opacity for the whole drawing session instead of fading out ~2 s after being drawn. They still stay out of undo history and are wiped by `C` (clear all) and when drawing mode ends. Better for tutorials, where a stroke used to disappear while you drew the next one. Pinning the annotations keeps session ink on screen; it clears only on a full exit.

## 1.3.0 — 2026-07-02

### Added
- **Restyle the selected shape**: with a shape selected (`V`), the toolbar's color swatches/popover and size slider act on that shape instead of the new-stroke defaults — picking a color recolors it, moving the slider resizes it, both undoable. Selecting a shape mirrors its color and size in the toolbar; deselecting restores your drawing defaults (unchanged by the edits). A highlighter keeps its translucent band when recolored. A continuous slider drag collapses into a single undo entry.
- **Toolbar toggle for "hidden in recordings"**: a new button on the floating toolbar shows the current content-protection state at a glance and lights up (accent) when the toolbar is hidden from screen recordings. Clicking it flips the setting; it stays in sync with `⇧R` and the Settings window.

## 1.2.0 — 2026-07-02

### Fixed
- **Multi-display drawing works everywhere.** Overlay windows were nudged off their displays by macOS (menu-bar constraint) and the first click on a non-active display was swallowed — drawing only worked on one screen. Overlays now cover their displays exactly, and **pointing at a display activates it**: the toolbar and keyboard focus follow the cursor, so the first click always draws. A drag crossing onto another display no longer hijacks the active display mid-stroke.
- **Custom color picking from the overlay.** The native macOS color panel opened *behind* the always-on-top overlay and was unusable (clicking around drew stray dots). Replaced with an in-overlay popover.
- Toolbar window stays clickable above the overlays (hotfix `3910b63`).

### Added
- **Color popover** in the toolbar: 15 preset swatches, recent colors, and a hex input (`#rrggbb`, `#` optional) — pick brand colors directly while drawing.
- **Vanishing ink** (`G`): strokes hold for 2 s, fade over 0.8 s, and disappear on their own; they never enter undo history. Made for live demos.
- **Toolbar controls**: `T` hides/shows the toolbar for the session; `Shift+T` resets it to the default bottom-center position.
- **Toolbar hidden in screen recordings**: new setting + `Shift+R`. The toolbar lives in its own window with macOS content protection — you see it, OBS/QuickTime don't. Drawings stay capturable.
- Menu-bar-only app: no Dock icon (`LSUIElement`); tray menu gained a "Settings…" item.

### Changed
- The floating toolbar moved into its own always-on-top window that follows the active display (required for recording-invisibility). One-time nit: a manually parked toolbar position from 1.1 may shift by the menu-bar height after upgrading; drag or `Shift+T` fixes it permanently.

## 1.1.0 — 2026-07-01

### Added
- **Select & move tool** (`V`): click selects the topmost shape (stroke-width hit tolerance, arrowheads clickable), drag moves it, `Delete`/`Backspace` removes it; moves and deletes are undoable. `Escape` cancels a drag (shape snaps back), then deselects, then exits drawing.
- **Toolbar position persistence**: the toolbar reappears where you left it; off-screen positions fall back to the default placement.
- **Recent custom colors** (up to 4) persist and appear next to the palette in both pickers.
- **Shortcut-registration warnings**: if the global toggle shortcut can't be registered (taken by another app), the control panel shows an inline warning instead of failing silently.
- Test foundation: Vitest over the pure drawing model; `npm test` joined lint + type-check as a quality gate.

### Changed
- **Layered rendering**: committed shapes are cached in an offscreen bitmap and re-rasterized only when they change — smooth drawing with hundreds of shapes (previously every cursor move redrew everything).
- Clear all (`C`) is now undoable.
- Undo history is capped at 100 operations.

## 1.0.4 — baseline

Standalone Electron app: pen, highlighter, line, arrow, rectangle, ellipse; per-display overlays; global toggle shortcut; control panel + settings windows.
