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
 * and opening the color popover both re-report bounds — the popover renders
 * inside the window, which grows (up or down, whichever fits) to hold it.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FloatingToolbar,
  POPOVER_HEIGHT,
  POPOVER_GAP,
  POPOVER_MARGIN,
} from "../overlay/floating-toolbar";
import { PALETTE, isPaletteColor, type OverlayTool } from "../overlay/constants";
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
  recentColors: string[];
  canUndo: boolean;
  canRedo: boolean;
  hasShapes: boolean;
  vanishing: boolean;
  toolbarPosition: { x: number; y: number } | null;
  workArea: WorkArea;
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

const FALLBACK_WORK_AREA: WorkArea = { x: 0, y: 0, width: 1440, height: 900 };

function isToolbarState(value: unknown): value is Partial<ToolbarState> {
  return typeof value === "object" && value !== null;
}

export function ToolbarView() {
  const barRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<OverlayTool>("pen");
  const [color, setColor] = useState(PALETTE[0].value);
  const [size, setSize] = useState(4);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false, hasShapes: false });
  const [vanishing, setVanishing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Display-relative desired top-left of the bar; null = default bottom-center.
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const workAreaRef = useRef<WorkArea>(FALLBACK_WORK_AREA);
  const barSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;

  const action = useCallback((payload: Record<string, unknown>) => {
    void window.screenDraw.ipc.invoke("toolbar:action", payload);
  }, []);

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

    if (pickerOpenRef.current) {
      // Grow the window to reserve space for the popover. Grow UP when there is
      // room above the bar within the work area, else grow DOWN. The bar keeps
      // its screen position; only the window (and the transparent reserve) moves.
      const growUp = barY >= POPOVER_RESERVE;
      const winY = growUp ? barY - POPOVER_RESERVE : barY;
      const winH = height + POPOVER_RESERVE;
      window.screenDraw.ipc.invoke("toolbar:setBounds", {
        width,
        height: winH,
        x: barX,
        y: winY,
      });
    } else {
      window.screenDraw.ipc.invoke("toolbar:setBounds", { width, height, x: barX, y: barY });
    }
  }, [resolveBarPos]);

  // Whether the bar should sit at the bottom (grow-up) or top (grow-down) of the
  // window while the popover is open. Kept in state so the flex alignment
  // re-renders. Closed: bottom-align is irrelevant (window == bar height).
  const [growUp, setGrowUp] = useState(true);
  useLayoutEffect(() => {
    const { height } = barSizeRef.current;
    const { y: barY } = resolveBarPos(barSizeRef.current.width, height, workAreaRef.current);
    setGrowUp(barY >= POPOVER_RESERVE);
  }, [pickerOpen, resolveBarPos]);

  // Apply an inbound state snapshot (from getState or the toolbar:state broadcast).
  const applyState = useCallback(
    (raw: unknown) => {
      if (!isToolbarState(raw)) return;
      if (raw.workArea) workAreaRef.current = raw.workArea;
      if (raw.toolbarPosition !== undefined) posRef.current = raw.toolbarPosition;
      if (typeof raw.tool === "string") setTool(raw.tool);
      if (typeof raw.color === "string") setColor(raw.color);
      if (typeof raw.size === "number") setSize(raw.size);
      if (Array.isArray(raw.recentColors)) setRecentColors(raw.recentColors);
      if (typeof raw.vanishing === "boolean") setVanishing(raw.vanishing);
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

  // The persisted toolbar position lives in settings (not in the overlay's
  // published state). Seed it on mount so a stored position is restored, then
  // follow settings:changed — the position changes from our own drag (persisted
  // below) and from the overlay's Shift+T reset (which persists null).
  useEffect(() => {
    void window.screenDraw.ipc
      .invoke<{ toolbarPosition?: { x: number; y: number } | null }>("settings:get")
      .then((s) => {
        posRef.current = s.toolbarPosition ?? null;
        reportBounds();
      })
      .catch(() => {});
    const unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
      const next = (params as { toolbarPosition?: { x: number; y: number } | null })
        .toolbarPosition;
      if (next === undefined) return;
      posRef.current = next;
      reportBounds();
    });
    return () => unsub();
  }, [reportBounds]);

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
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pickerOpenRef.current) {
        e.preventDefault();
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
          color={color}
          onColorChange={(c) => {
            setColor(c);
            action({ type: "setColor", color: c });
          }}
          onColorCommit={(c) => {
            if (!isPaletteColor(c)) action({ type: "recentColor", color: c });
          }}
          recentColors={recentColors}
          pickerOpen={pickerOpen}
          onPickerOpenChange={setPickerOpen}
          size={size}
          onSizeChange={(s) => {
            setSize(s);
            action({ type: "setSize", size: s });
          }}
          vanishing={vanishing}
          onVanishingToggle={() => {
            setVanishing((v) => !v);
            action({ type: "toggleVanishing" });
          }}
          onGripDrag={onGripDrag}
          onGripDragEnd={onGripDragEnd}
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
