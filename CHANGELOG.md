# Changelog

All notable changes to Screen Draw are documented here. Feature descriptions live in [docs/features.md](docs/features.md).

## 1.7.1 — 2026-07-04

### Fixed
- **Text input lifecycle.** Non-empty text now commits when you click another text point, switch tools, pin annotations, or blur the input; empty inputs cancel. While the caret is open, `⌘Z`/`⌘⇧Z` stay with text editing instead of undoing or redoing canvas shapes.

## 1.7.0 — 2026-07-03

### Added
- **Laser pointer** (`F`): temporary glowing strokes use the current color and brush size, hold briefly after release, then fade away without entering undo/redo, selection, clear-all, or session-ink wipes.
- **Eraser** (`E`): drag across committed strokes or shapes to remove every touched item, coalesced into one undo step per drag.
- **Text tool** (`X`): click to type a single-line label, commit with Enter or blur, cancel with Escape, then select, move, restyle, delete, undo, and redo it like other annotations.
- **Board mode** (`W`): cycle the active display between transparent, whiteboard, and blackboard backgrounds; boards are session-only overlay backgrounds and stay out of undo/clear.
- **Smoother freehand ink**: pen, highlighter, and laser strokes now render with midpoint quadratic smoothing while the model keeps the same raw thinned points for hit-testing and undo.

## 1.6.5 — 2026-07-03

### Added
- **Shared session ink.** The control panel's **Same as primary** toolbar scope now shares session ink (`G` / ghost button) across displays along with toolbar position, tool, color, and size. With shared session ink on, a full exit wipes every display's canvas; per-display scope keeps `G` affecting only the active display.

## 1.6.4 — 2026-07-03

### Added
- **Shared toolbar tool settings.** The control panel's **Same as primary** toolbar scope now carries the active tool, color, and size across displays along with the toolbar position. Per-display mode keeps each display's toolbar state independent.

### Fixed
- **Toolbar-scope label overflow.** The control-panel labels for the toolbar scope selector no longer overflow their segmented-control buttons (`4d0490d`).

## 1.6.3 — 2026-07-03

### Added
- **Toolbar position scope.** The control panel now lets the toolbar use the same saved position on every display (the default, matching previous releases) or remember a separate position per display. In per-display mode, dragging stores the active display's toolbar position and `Shift+T` resets only that display's saved position.
- **Cross-display LAT-161 fields.** `SCREEN_DRAW_LAT=1` activation lines now include `toolbarCrossedDisplays` and a top-level `toolbarSetBoundsMs` value for the H10 toolbar-move probe; normal launches remain silent.

## 1.6.2 — 2026-07-02

### Added
- **Autonomous activation-latency diagnostics.** `SCREEN_DRAW_LAT=1` enables `[LAT-161]` instrumentation, a file-trigger probe, and `scripts/lat-scenarios.sh` for the A–F latency matrix. The probe is inert in normal launches.

### Changed
- **No experimental activation fix shipped.** The packaged 1.6.1 candidate measured green/inconclusive across the full A–F matrix: no stage's p95 exceeded the panel-visible baseline by 50 ms. The H1–H4 experiment ladder was skipped; owner QA remains the real-shortcut feel test on a physical display.

## 1.6.1 — 2026-07-02

### Fixed
- **Floating-toolbar tooltips are visible again.** Hovering toolbar controls shows the control name and shortcut (where available); the toolbar window now reserves transparent space so those labels are not clipped.

### Changed
- **Drawing activation latency mitigation.** The overlay and floating toolbar stay warm while hidden, and the toolbar is shown before macOS app focus is requested. This improves the measured app-side activation path, but owner QA still reports intermittent lag after switching windows, so this release does not claim the activation issue is fully fixed.

## 1.6.0 — 2026-07-02

### Changed
- **Performance: lighter and smoother, no behavior changes.** A pass over the app to make the control panel open instantly, keep ink glassy-smooth during long strokes, and sip less battery — all user-visible behavior is unchanged; only speed, memory, and power differ.
  - **Faster control-panel load.** Dropped TanStack Router and React Query from the control panel — every screen's data already arrives over IPC, so plain state handles it directly. The main-window chunk shrank from ~101 KB to ~8 KB (plus the router/query common chunks are gone entirely), so the panel opens noticeably quicker.
  - **Thinned stroke points.** Pen and highlighter strokes now skip points closer than a minimum spacing (`MIN_POINT_DISTANCE`, 1.5 px) to the previous one, so a long, slow stroke no longer accumulates thousands of near-duplicate points. This ends the gradual stutter on long strokes and speeds up hit-testing; the committed stroke can end up to 1.5 px short of the exact pointer-up position, which is visually indistinguishable.
  - **Frame-synced overlay repaints.** All repaint triggers (pointer drag, settings broadcasts, toolbar actions) now coalesce through a single `requestAnimationFrame`-scheduled paint, guaranteeing at most one full-screen repaint per frame instead of several — less wasted GPU fill-rate on Retina displays, with no added input latency.
  - **Build tooling.** Enabled the React Compiler via Vite's Babel option and set `build.target` to `chrome150` (the Chromium bundled with Electron 43), so the renderer is compiled for the engine it actually runs on rather than older ones.

## 1.5.0 — 2026-07-02

### Changed
- **Session ink** (`G`) redefined: while it's on, drawing now works *exactly* like normal — strokes commit to the canvas and are selectable (`V`), restylable, movable, deletable, and fully undoable/redoable with `⌘Z`. The toggle's only effect is on a **full exit** (`Esc` / **Stop drawing** / the global toggle): if session ink is on, the canvas and undo history reset to a clean slate, so the next drawing session starts fresh. Pinning (`S`) never wipes — pinned annotations stay. With session ink off, everything persists across hide/show as before. Previously session-ink strokes lived outside the model and couldn't be selected or restyled; this fixes that.

## 1.4.0 — 2026-07-02

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
