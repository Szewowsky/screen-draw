/**
 * The toolbar window's React root.
 *
 * Holds the toolbar-facing state (tool/color/size/recents/history/ghost), which
 * is a mirror of the active overlay's state relayed through main:
 *
 * - Inbound: `toolbar:state` broadcasts (seeded once via `toolbar:getState` on
 *   mount, in case the toolbar shows after the active overlay already published).
 * - Outbound: `toolbar:action` invokes for every user action.
 *
 * The window is sized to the rendered bar. This view measures the bar with a
 * ResizeObserver and reports the desired geometry over `toolbar:setBounds`:
 * display-relative top-left plus content size, which main translates into
 * absolute coordinates within the active display's work area. Dragging the grip
 * opening the color popover, and hover tooltips all re-use those bounds — the
 * popover/tooltips render inside the window, which grows to hold them.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FloatingToolbar,
  POPOVER_HEIGHT,
  POPOVER_GAP,
  POPOVER_MARGIN,
} from "../overlay/floating-toolbar";
import { PALETTE, isPaletteColor, type BoardMode, type OverlayTool } from "../overlay/constants";
import type { ScreenDrawSettings, ToolbarPosition } from "../overlay/constants";
import {
  clampToolbarPosition,
  sanitizeToolbarPosition,
  type Viewport,
} from "../overlay/toolbar-prefs";

interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ToolbarState {
  tool: OverlayTool;
  color: string;
  size: number;
  /** Style of the selected shape, or null when nothing is selected. */
  selectionStyle: { color: string; size: number } | null;
  recentColors: string[];
  canUndo: boolean;
  canRedo: boolean;
  hasShapes: boolean;
  vanishing: boolean;
  boardMode: BoardMode;
  activeDisplayId: number | null;
  workArea: WorkArea;
}

interface OverlayActiveChanged {
  active?: boolean;
  latencyProbe?: boolean;
  latencyActivationId?: string;
}

/** Default bottom offset of the toolbar from the work-area bottom (matches 1.1). */
const DEFAULT_BOTTOM_OFFSET = 88;

/**
 * Height reserved above (or below) the bar for the color popover. The popover is
 * bounded (a 3-row preset grid + up to 4 recents + a hex row), and the bar is
 * always far wider than the 168px popover, so only the window's HEIGHT ever
 * changes. A generous reserve means the popover's own above/below flip always
 * lands it inside the window; the extra transparent space is invisible.
 */
const POPOVER_RESERVE = POPOVER_HEIGHT + POPOVER_GAP + POPOVER_MARGIN + 42;
/** Transparent room for hover tooltips; otherwise the toolbar window clips them. */
const TOOLTIP_RESERVE = 40;
/** Side room for long hover tooltips on the first/last toolbar items. */
const TOOLTIP_SIDE_RESERVE = 96;

const FALLBACK_WORK_AREA: WorkArea = { x: 0, y: 0, width: 1440, height: 900 };

function isToolbarState(value: unknown): value is Partial<ToolbarState> {
  return typeof value === "object" && value !== null;
}

function isToolbarPosition(value: unknown): value is ToolbarPosition {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as Partial<Record<"x" | "y", unknown>>;
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y);
}

function selectToolbarPositionForDisplay(
  settings: Partial<ScreenDrawSettings>,
  activeDisplayId: number | null,
): ToolbarPosition | null {
  if (settings.toolbarPositionScope === "per-display") {
    if (activeDisplayId === null) return null;
    const position = settings.toolbarPositionByDisplay?.[String(activeDisplayId)];
    return isToolbarPosition(position) ? position : null;
  }
  return isToolbarPosition(settings.toolbarPosition) ? settings.toolbarPosition : null;
}

function markLatencyActivation(params: OverlayActiveChanged): void {
  if (
    params.active !== true ||
    params.latencyProbe !== true ||
    typeof params.latencyActivationId !== "string"
  ) {
    return;
  }

  const receivedAt = performance.now();
  const visibilityState = document.visibilityState;
  requestAnimationFrame(() => {
    const raf1At = performance.now();
    requestAnimationFrame(() => {
      const raf2At = performance.now();
      window.screenDraw.ipc.send("perf:mark", {
        latencyActivationId: params.latencyActivationId,
        source: "toolbar",
        displayId: null,
        visibilityState,
        activeToRaf1Ms: raf1At - receivedAt,
        activeToRaf2Ms: raf2At - receivedAt,
      });
    });
  });
}

export function ToolbarView() {
  const barRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<OverlayTool>("pen");
  const [color, setColor] = useState(PALETTE[0].value);
  const [size, setSize] = useState(4);
  // Style of the selected shape mirrored from the overlay, or null when nothing
  // is selected. When set, the displayed color/size switch to it, while the
  // `color`/`size` above stay as the untouched new-stroke defaults.
  const [selectionStyle, setSelectionStyle] = useState<{ color: string; size: number } | null>(
    null,
  );
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [history, setHistory] = useState({
    canUndo: false,
    canRedo: false,
    hasShapes: false,
  });
  const [vanishing, setVanishing] = useState(false);
  const [boardMode, setBoardMode] = useState<BoardMode>("transparent");
  const [hideInRecordings, setHideInRecordings] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Display-relative desired top-left of the bar; null = default bottom-center.
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const settingsRef = useRef<Partial<ScreenDrawSettings> | null>(null);
  const activeDisplayIdRef = useRef<number | null>(null);
  const workAreaRef = useRef<WorkArea>(FALLBACK_WORK_AREA);
  const barSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;

  const action = useCallback((payload: Record<string, unknown>) => {
    void window.screenDraw.ipc.invoke("toolbar:action", payload);
  }, []);

  // Single choke point for the popover's open/close state. Whenever it closes,
  // hand keyboard focus back to the active overlay: clicking the swatch focused
  // the toolbar window, and closing the popover any other way (Escape, outside
  // click, blur, deactivate) would otherwise strand focus on the toolbar,
  // starving the overlay's single-key shortcuts. Applying a color already
  // refocuses via the setColor action, but firing here too is harmless (main
  // just re-focuses the already-active overlay).
  const setPicker = useCallback(
    (open: boolean) => {
      setPickerOpen(open);
      if (!open) action({ type: "refocusOverlay" });
    },
    [action],
  );

  /**
   * Resolve the bar's display-relative top-left. A stored position is sanitized
   * against the current work area (falling back to the default bottom-center
   * placement when it is off-screen after a display change, matching 1.1); an
   * absent one uses the default. Pure w.r.t. the passed-in size/area.
   */
  const resolveBarPos = useCallback((width: number, height: number, wa: WorkArea) => {
    const viewport: Viewport = { width: wa.width, height: wa.height };
    const stored = posRef.current ? sanitizeToolbarPosition(posRef.current, viewport) : null;
    if (stored) return stored;
    return {
      x: Math.max(0, Math.round((wa.width - width) / 2)),
      y: Math.max(0, wa.height - height - DEFAULT_BOTTOM_OFFSET),
    };
  }, []);

  /** Report the window's geometry (content size + display-relative position). */
  const reportBounds = useCallback(() => {
    const { width, height } = barSizeRef.current;
    if (width === 0 || height === 0) return;
    const wa = workAreaRef.current;

    const { x: barX, y: barY } = resolveBarPos(width, height, wa);

    const reserve = pickerOpenRef.current ? POPOVER_RESERVE : TOOLTIP_RESERVE;
    const growUp = barY >= reserve;
    const winW = width + TOOLTIP_SIDE_RESERVE * 2;
    const winX = barX - TOOLTIP_SIDE_RESERVE;
    if (reserve > 0) {
      // Grow the window to reserve transparent space for popovers/tooltips.
      // Grow UP when there is room above the bar within the work area, else grow
      // DOWN. The bar keeps its screen position; only the transparent reserve
      // area moves.
      const winY = growUp ? barY - reserve : barY;
      const winH = height + reserve;
      window.screenDraw.ipc.invoke("toolbar:setBounds", {
        width: winW,
        height: winH,
        x: winX,
        y: winY,
      });
    } else {
      window.screenDraw.ipc.invoke("toolbar:setBounds", {
        width: winW,
        height,
        x: winX,
        y: barY,
      });
    }
  }, [resolveBarPos]);

  const applyToolbarSettings = useCallback(
    (raw: unknown) => {
      if (typeof raw !== "object" || raw === null) return;
      const next = raw as Partial<ScreenDrawSettings>;
      settingsRef.current = next;
      posRef.current = selectToolbarPositionForDisplay(next, activeDisplayIdRef.current);
      reportBounds();
    },
    [reportBounds],
  );

  // Whether the bar should sit at the bottom (grow-up) or top (grow-down) of the
  // window while transparent reserve space is open for a tooltip/popover. Kept
  // in state so the flex alignment and tooltip side re-render.
  const [growUp, setGrowUp] = useState(true);
  useLayoutEffect(() => {
    const { height } = barSizeRef.current;
    const { y: barY } = resolveBarPos(barSizeRef.current.width, height, workAreaRef.current);
    const reserve = pickerOpen ? POPOVER_RESERVE : TOOLTIP_RESERVE;
    setGrowUp(barY >= reserve);
  }, [pickerOpen, resolveBarPos]);

  // Apply an inbound state snapshot (from getState or the toolbar:state broadcast).
  const applyState = useCallback(
    (raw: unknown) => {
      if (!isToolbarState(raw)) return;
      if (raw.workArea) workAreaRef.current = raw.workArea;
      if (raw.activeDisplayId !== undefined) {
        activeDisplayIdRef.current =
          typeof raw.activeDisplayId === "number" ? raw.activeDisplayId : null;
        if (settingsRef.current) {
          posRef.current = selectToolbarPositionForDisplay(
            settingsRef.current,
            activeDisplayIdRef.current,
          );
        }
      }
      if (typeof raw.tool === "string") setTool(raw.tool);
      if (typeof raw.color === "string") setColor(raw.color);
      if (typeof raw.size === "number") setSize(raw.size);
      // `selectionStyle` is present in every published snapshot (object or null);
      // apply it only when the key is present so seed/partial states don't reset it.
      if ("selectionStyle" in raw) {
        const s = raw.selectionStyle;
        setSelectionStyle(
          s && typeof s.color === "string" && typeof s.size === "number"
            ? { color: s.color, size: s.size }
            : null,
        );
      }
      if (Array.isArray(raw.recentColors)) setRecentColors(raw.recentColors);
      if (typeof raw.vanishing === "boolean") setVanishing(raw.vanishing);
      if (
        raw.boardMode === "transparent" ||
        raw.boardMode === "white" ||
        raw.boardMode === "black"
      ) {
        setBoardMode(raw.boardMode);
      }
      setHistory({
        canUndo: raw.canUndo === true,
        canRedo: raw.canRedo === true,
        hasShapes: raw.hasShapes === true,
      });
      // Work area / position may have changed (display switch); re-place.
      reportBounds();
    },
    [reportBounds],
  );

  // Seed from the cached state, then follow broadcasts.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const state = await window.screenDraw.ipc.invoke("toolbar:getState");
        applyState(state);
      } catch {
        // Fall back to defaults until the first broadcast.
      }
      unsub = window.screenDraw.ipc.on("toolbar:state", (params) => applyState(params));
    })();
    return () => unsub?.();
  }, [applyState]);

  // The persisted toolbar positions live in settings (not in the overlay's
  // published state). Seed them on mount so a stored position is restored, then
  // follow settings:changed — the position changes from our own drag (persisted
  // below), the overlay's Shift+T reset, and the control-panel scope selector.
  useEffect(() => {
    void window.screenDraw.ipc
      .invoke<ScreenDrawSettings>("settings:get")
      .then((s) => applyToolbarSettings(s))
      .catch(() => {});
    const unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
      applyToolbarSettings(params);
    });
    return () => unsub();
  }, [applyToolbarSettings]);

  // The hidden-in-recordings state lives in settings and syncs over
  // settings:changed (the same channel the Settings window and Shift+R use), not
  // through the overlay's toolbar:state. Seed on mount and follow broadcasts so
  // the on-bar toggle, Shift+R, and the Settings window stay in sync; the button
  // click only invokes the atomic flip and lets the broadcast drive this state.
  useEffect(() => {
    void window.screenDraw.ipc
      .invoke<{ hideToolbarInRecordings?: boolean }>("settings:get")
      .then((s) => setHideInRecordings(s.hideToolbarInRecordings === true))
      .catch(() => {});
    const unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
      setHideInRecordings(
        (params as { hideToolbarInRecordings?: boolean }).hideToolbarInRecordings === true,
      );
    });
    return () => unsub();
  }, []);

  // Measure the bar and report bounds whenever its size changes (initial layout,
  // and when recents grow it). Also re-report when the popover opens/closes.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      // Use the border-box (offset) size so the window matches the visible bar.
      barSizeRef.current = { width: bar.offsetWidth, height: bar.offsetHeight };
      reportBounds();
    });
    observer.observe(bar);
    barSizeRef.current = { width: bar.offsetWidth, height: bar.offsetHeight };
    reportBounds();
    return () => observer.disconnect();
  }, [reportBounds]);

  useLayoutEffect(() => {
    reportBounds();
  }, [pickerOpen, reportBounds]);

  // Close the popover on Escape (mirrors the overlay's behavior in its own
  // window); other keys are handled by the overlay, which holds drawing focus.
  // Routes through setPicker so focus returns to the overlay on close.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pickerOpenRef.current) {
        e.preventDefault();
        setPicker(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setPicker]);

  // The in-window outside-click close only sees clicks inside the toolbar
  // window; a click on the overlay canvas (or another display) lands in a
  // different window, so the toolbar window blurs instead. Close the popover on
  // blur so its transparent reserve area stops swallowing draw clicks and the
  // window shrinks back to the bar. Guarded on pickerOpenRef so ordinary
  // toolbar-button blurs (each refocuses the overlay) don't fire spuriously.
  useEffect(() => {
    const onBlur = () => {
      if (pickerOpenRef.current) setPicker(false);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [setPicker]);

  // Deactivating drawing (or switching away) while the popover is open must not
  // resurrect it — with its oversized reserve bounds — next session. The window
  // is hidden, not destroyed, so close the popover when the overlay reports
  // inactive, resetting both the picker state and the reserve-height bounds.
  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("overlay:active-changed", (params) => {
      markLatencyActivation((params as OverlayActiveChanged | undefined) ?? {});
      const active = (params as { active?: boolean } | undefined)?.active;
      if (active === false && pickerOpenRef.current) setPicker(false);
    });
    return () => unsub();
  }, [setPicker]);

  // Grip drag: the bar's new screen top-left is `pointerScreen - grabOffset`
  // (grabOffset = where in the bar the pointer grabbed). Convert to
  // display-relative, clamp into the work area, and resize the window there.
  const onGripDrag = useCallback(
    (screenX: number, screenY: number, offsetX: number, offsetY: number) => {
      const wa = workAreaRef.current;
      const relX = screenX - offsetX - wa.x;
      const relY = screenY - offsetY - wa.y;
      const clamped = clampToolbarPosition(
        { x: relX, y: relY },
        { width: wa.width, height: wa.height },
      );
      posRef.current = clamped;
      reportBounds();
    },
    [reportBounds],
  );

  const onGripDragEnd = useCallback(() => {
    if (posRef.current) {
      void window.screenDraw.ipc.invoke("settings:setDefaults", {
        toolbarPosition: posRef.current,
      });
    }
  }, []);

  return (
    <div
      className={
        "pointer-events-none flex h-screen w-screen justify-center " +
        (growUp ? "items-end" : "items-start")
      }
    >
      <div className="pointer-events-auto">
        <FloatingToolbar
          barRef={barRef}
          tool={tool}
          onToolChange={(t) => {
            setTool(t);
            action({ type: "setTool", tool: t });
          }}
          color={selectionStyle ? selectionStyle.color : color}
          onColorChange={(c) => {
            // With a shape selected, the pick restyles it: update the mirrored
            // selection style optimistically, not the new-stroke default.
            if (selectionStyle) setSelectionStyle({ ...selectionStyle, color: c });
            else setColor(c);
            action({ type: "setColor", color: c });
          }}
          onColorCommit={(c) => {
            if (!isPaletteColor(c)) action({ type: "recentColor", color: c });
          }}
          recentColors={recentColors}
          pickerOpen={pickerOpen}
          onPickerOpenChange={setPicker}
          size={selectionStyle ? selectionStyle.size : size}
          onSizeChange={(s) => {
            if (selectionStyle) setSelectionStyle({ ...selectionStyle, size: s });
            else setSize(s);
            action({ type: "setSize", size: s });
          }}
          vanishing={vanishing}
          onVanishingToggle={() => {
            setVanishing((v) => !v);
            action({ type: "toggleVanishing" });
          }}
          boardMode={boardMode}
          onBoardModeCycle={() => action({ type: "cycleBoardMode" })}
          onPin={() => action({ type: "pin" })}
          hideInRecordings={hideInRecordings}
          onHideInRecordingsToggle={() => {
            void window.screenDraw.ipc.invoke("settings:setDefaults", {
              toggleHideToolbarInRecordings: true,
            });
          }}
          onGripDrag={onGripDrag}
          onGripDragEnd={onGripDragEnd}
          tooltipSide={growUp ? "top" : "bottom"}
          canUndo={history.canUndo}
          onUndo={() => action({ type: "undo" })}
          canRedo={history.canRedo}
          onRedo={() => action({ type: "redo" })}
          canClear={history.hasShapes}
          onClear={() => action({ type: "clear" })}
          onExit={() => action({ type: "exit" })}
        />
      </div>
    </div>
  );
}
