/**
 * The floating drawing toolbar and its in-window color popover.
 *
 * Extracted from the overlay so it can live in its own dedicated toolbar window
 * (slice 5). The component is purely presentational: it renders the bar and the
 * popover and reports intent through callbacks. All state (tool/color/size/…)
 * and all persistence live in the toolbar window's view, which relays actions to
 * the active overlay over main-process IPC.
 *
 * Layout note: in the toolbar window the bar is pinned to the bottom edge and
 * the window is sized to the bar. When the color popover opens, the toolbar
 * window grows upward so the popover — which renders above the bar — stays fully
 * inside the window (its own screen-saver level would otherwise clip it).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  Button,
  SegmentedControl,
  SegmentedControlItem,
  Separator,
  Slider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Ghost,
  GripVertical,
  Highlighter,
  Minus,
  MousePointer2,
  Pencil,
  Pin,
  Redo2,
  Square,
  Undo2,
  VideoOff,
  X,
} from "lucide-react";
import {
  COLOR_PRESETS,
  MAX_SIZE,
  MIN_SIZE,
  PALETTE,
  isPaletteColor,
  type OverlayTool,
} from "./constants";
import { normalizeHexColor } from "./color";

export const TOOLS: { tool: OverlayTool; label: string; key: string; Icon: typeof Pencil }[] = [
  { tool: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { tool: "pen", label: "Pen", key: "P", Icon: Pencil },
  { tool: "highlighter", label: "Highlighter", key: "H", Icon: Highlighter },
  { tool: "line", label: "Line", key: "L", Icon: Minus },
  { tool: "arrow", label: "Arrow", key: "A", Icon: ArrowUpRight },
  { tool: "rectangle", label: "Rectangle", key: "R", Icon: Square },
  { tool: "ellipse", label: "Ellipse", key: "O", Icon: Circle },
];

interface FloatingToolbarProps {
  tool: OverlayTool;
  onToolChange: (tool: OverlayTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  onColorCommit: (color: string) => void;
  recentColors: string[];
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  size: number;
  onSizeChange: (size: number) => void;
  vanishing: boolean;
  onVanishingToggle: () => void;
  /** Pin the annotations: leave them on screen but click-through (sticky mode). */
  onPin: () => void;
  /** Whether the toolbar window is hidden from screen recordings (content protection). */
  hideInRecordings: boolean;
  /** Toggle the hidden-in-recordings state (atomic flip in main). */
  onHideInRecordingsToggle: () => void;
  /**
   * Fires on each grip-drag move. `screenX/Y` are the pointer's screen
   * coordinates; `offsetX/Y` are the pointer's offset from the bar's top-left at
   * grab time, so the view can compute the bar's new screen position as
   * `screen - offset`.
   */
  onGripDrag: (screenX: number, screenY: number, offsetX: number, offsetY: number) => void;
  /** Fires once when a grip drag ends, so the window position can be persisted. */
  onGripDragEnd: () => void;
  /** Ref to the bar element, so the view can measure it to size the window. */
  barRef: RefObject<HTMLDivElement | null>;
  /** Tooltip direction chosen by the toolbar window to keep popovers inside it. */
  tooltipSide: "top" | "bottom";
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  canClear: boolean;
  onClear: () => void;
  onExit: () => void;
}

export function FloatingToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  onColorCommit,
  recentColors,
  pickerOpen,
  onPickerOpenChange,
  size,
  onSizeChange,
  vanishing,
  onVanishingToggle,
  onPin,
  hideInRecordings,
  onHideInRecordingsToggle,
  onGripDrag,
  onGripDragEnd,
  barRef,
  tooltipSide,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  canClear,
  onClear,
  onExit,
}: FloatingToolbarProps) {
  const dragging = useRef(false);

  const onGripDown = (e: ReactPointerEvent) => {
    // The grip drag moves the whole toolbar WINDOW. Capture where in the bar the
    // pointer grabbed (offset from the bar's top-left) so the view can place the
    // bar at `pointerScreen - offset`, then setBounds on the window.
    e.preventDefault();
    dragging.current = true;
    const rect = barRef.current?.getBoundingClientRect();
    const offsetX = rect ? e.clientX - rect.left : 0;
    const offsetY = rect ? e.clientY - rect.top : 0;

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      onGripDrag(ev.screenX, ev.screenY, offsetX, offsetY);
    };
    const onUp = () => {
      dragging.current = false;
      onGripDragEnd();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const customColors = recentColors.filter((c) => !isPaletteColor(c));

  const swatchRef = useRef<HTMLButtonElement>(null);

  const applyColor = useCallback(
    (value: string) => {
      onColorChange(value);
      onColorCommit(value);
      onPickerOpenChange(false);
    },
    [onColorChange, onColorCommit, onPickerOpenChange],
  );

  return (
    <div
      ref={barRef}
      className="flex h-9 w-max items-center gap-0.5 rounded-[12px] border border-white/10 bg-[#1d1d1f]/95 px-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Move toolbar"
            onPointerDown={onGripDown}
            className="flex h-6 w-4 cursor-grab items-center justify-center text-tertiary active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>Drag to move</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <SegmentedControl
        type="single"
        size="small"
        value={tool}
        className="!rounded-[11px] !p-1"
        onValueChange={(value) => {
          if (typeof value === "string" && value) onToolChange(value as OverlayTool);
        }}
        aria-label="Drawing tool"
      >
        {TOOLS.map(({ tool: t, label, key, Icon }) => (
          <Tooltip key={t}>
            <TooltipTrigger asChild>
              <SegmentedControlItem
                value={t}
                iconOnly
                className="!size-6 !rounded-md"
                aria-label={label}
              >
                <Icon className="size-3.5" />
              </SegmentedControlItem>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} shortcut={[key]}>
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </SegmentedControl>

      <Separator orientation="vertical" />

      <SegmentedControl
        type="single"
        size="small"
        value={color}
        className="!rounded-[11px] !p-1"
        onValueChange={(value) => {
          if (typeof value === "string" && value) onColorChange(value);
        }}
        aria-label="Color"
      >
        {PALETTE.map((c, i) => (
          <Tooltip key={c.value}>
            <TooltipTrigger asChild>
              <SegmentedControlItem
                value={c.value}
                iconOnly
                className="!size-6 !rounded-md"
                aria-label={c.name}
              >
                <span className="size-3.5 rounded-full" style={{ backgroundColor: c.value }} />
              </SegmentedControlItem>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} shortcut={[String(i + 1)]}>
              {c.name}
            </TooltipContent>
          </Tooltip>
        ))}
        {customColors.map((c) => (
          <Tooltip key={c}>
            <TooltipTrigger asChild>
              <SegmentedControlItem
                value={c}
                iconOnly
                className="!size-6 !rounded-md"
                aria-label={`Recent color ${c}`}
              >
                <span className="size-3.5 rounded-full" style={{ backgroundColor: c }} />
              </SegmentedControlItem>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide}>Recent color</TooltipContent>
          </Tooltip>
        ))}
      </SegmentedControl>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={swatchRef}
            type="button"
            aria-label="Custom color"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => onPickerOpenChange(!pickerOpen)}
            className="no-drag size-7 shrink-0 rounded-md border border-white/15 shadow-inner"
            style={{ backgroundColor: color }}
          />
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>Custom color</TooltipContent>
      </Tooltip>
      {pickerOpen ? (
        <ColorPopover
          anchorRef={swatchRef}
          color={color}
          recentColors={customColors}
          onApply={applyColor}
          onClose={() => onPickerOpenChange(false)}
        />
      ) : null}

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-[68px]">
            <Slider
              variant="filled"
              size="small"
              className="!h-7 w-full !rounded-md"
              value={[size]}
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={1}
              onValueChange={(value) => onSizeChange(value[0])}
              endContent={(v) => <span className="tabular-nums">{v}</span>}
              endContentClassName="!min-w-7 !pr-2.5 !text-sm"
              aria-label="Brush size"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["[", "]"]}>
          Brush size
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className={
              "!size-6" + (vanishing ? " !bg-orange-500/95 !text-white hover:!bg-orange-500" : "")
            }
            aria-pressed={vanishing}
            onClick={onVanishingToggle}
            aria-label="Session ink"
          >
            <Ghost className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["G"]}>
          Session ink
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Undo"
          >
            <Undo2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["⌘", "Z"]}>
          Undo
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label="Redo"
          >
            <Redo2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["⌘", "⇧", "Z"]}>
          Redo
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            disabled={!canClear}
            onClick={onClear}
            aria-label="Clear all"
          >
            <Eraser className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["C"]}>
          Clear all
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className={
              "!size-6" +
              (hideInRecordings ? " !bg-orange-500/95 !text-white hover:!bg-orange-500" : "")
            }
            aria-pressed={hideInRecordings}
            onClick={onHideInRecordingsToggle}
            aria-label="Hidden in recordings"
          >
            <VideoOff className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["⇧", "R"]}>
          Hidden in recordings
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            onClick={onPin}
            aria-label="Pin annotations"
          >
            <Pin className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["S"]}>
          Pin annotations
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="transparent"
            size="small"
            iconOnly
            className="!size-6"
            onClick={onExit}
            aria-label="Stop drawing"
          >
            <X className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} shortcut={["Esc"]}>
          Stop drawing
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

interface ColorPopoverProps {
  anchorRef: RefObject<HTMLButtonElement | null>;
  color: string;
  recentColors: string[];
  onApply: (color: string) => void;
  onClose: () => void;
}

/** Estimated popover size, used to place it before it has measured itself. */
export const POPOVER_WIDTH = 168;
export const POPOVER_HEIGHT = 200;
export const POPOVER_GAP = 8;
export const POPOVER_MARGIN = 8;

/**
 * In-window color picker rendered as plain DOM (the native macOS color panel
 * would open behind the screen-saver-level window). Shows a preset grid, the
 * recent-colors row, and a hex input. Positions itself above the anchoring
 * swatch, flipping below when there is no room. Closes on outside click; Escape
 * is handled by the hosting window's keydown listener.
 */
function ColorPopover({ anchorRef, color, recentColors, onApply, onClose }: ColorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Place the popover relative to the swatch: above by default, below when it
  // sits near the top edge; clamp horizontally into the window. Re-runs on
  // window resize: in the toolbar window, opening the popover grows the window
  // (an async IPC round-trip) so the swatch's viewport-relative position shifts
  // after the initial layout — re-placing keeps the popover pinned to the bar.
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const height = popoverRef.current?.offsetHeight ?? POPOVER_HEIGHT;
      const width = popoverRef.current?.offsetWidth ?? POPOVER_WIDTH;
      const above = rect.top - POPOVER_GAP - height;
      const below = rect.bottom + POPOVER_GAP;
      const top = above >= POPOVER_MARGIN ? above : below;
      const centered = rect.left + rect.width / 2 - width / 2;
      const maxLeft = window.innerWidth - width - POPOVER_MARGIN;
      const left = Math.min(Math.max(POPOVER_MARGIN, centered), Math.max(POPOVER_MARGIN, maxLeft));
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorRef]);

  // Close when clicking anywhere outside the popover (but not on the anchor,
  // whose own click toggles the popover).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node;
      if (popoverRef.current?.contains(node)) return;
      if (anchorRef.current?.contains(node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchorRef, onClose]);

  const submitHex = () => {
    const normalized = normalizeHexColor(hex);
    if (normalized) onApply(normalized);
  };

  const normalizedHex = normalizeHexColor(hex);
  const hexInvalid = hex.trim() !== "" && normalizedHex === null;

  // Rendered through a portal to document.body: the bar div uses backdrop-filter,
  // which would make a `position: fixed` descendant resolve against the bar box
  // instead of the viewport, throwing the popover off-screen.
  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Color picker"
      className="no-drag fixed z-40 flex w-[168px] flex-col gap-2 rounded-[12px] border border-white/10 bg-[#1d1d1f]/95 p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <div className="grid grid-cols-5 gap-1.5">
        {COLOR_PRESETS.map((c) => {
          const selected = c.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => onApply(c)}
              className={
                "size-6 rounded-md border shadow-inner " +
                (selected ? "border-white ring-1 ring-white" : "border-white/15")
              }
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>

      {recentColors.length > 0 ? (
        <>
          <Separator orientation="horizontal" />
          <div className="flex flex-wrap gap-1.5">
            {recentColors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Recent color ${c}`}
                onClick={() => onApply(c)}
                className="size-6 rounded-md border border-white/15 shadow-inner"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </>
      ) : null}

      <Separator orientation="horizontal" />

      <div className="flex items-center gap-1.5">
        <span
          className="size-6 shrink-0 rounded-md border border-white/15 shadow-inner"
          style={{ backgroundColor: normalizedHex ?? color }}
        />
        <input
          type="text"
          value={hex}
          spellCheck={false}
          autoComplete="off"
          placeholder="#rrggbb"
          aria-label="Hex color"
          aria-invalid={hexInvalid}
          onChange={(e) => setHex(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter applies the hex value; Escape is left to bubble to the
            // window keydown, which closes the popover.
            if (e.key === "Enter") {
              e.preventDefault();
              submitHex();
            }
          }}
          className={
            "h-6 w-full min-w-0 rounded-md border bg-black/30 px-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 " +
            (hexInvalid ? "border-red-500/70" : "border-white/15 focus:border-white/30")
          }
        />
      </div>
    </div>,
    document.body,
  );
}
