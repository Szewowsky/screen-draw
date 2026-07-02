import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ColorWell,
  Field,
  FieldSet,
  Key,
  KeyGroup,
  ScrollArea,
  SegmentedControl,
  SegmentedControlItem,
  Separator,
  Slider,
  Text,
  Toolbar,
  ToolbarContent,
  ToolbarTitle,
  toast,
} from "../components/ui";
import { Pencil, TriangleAlert } from "lucide-react";
import {
  MAX_SIZE,
  MIN_SIZE,
  PALETTE,
  isPaletteColor,
  type ScreenDrawSettings,
  type ShortcutStatus,
} from "../overlay/constants";

const SHORTCUT_ROWS: { label: string; keys: ReactNode }[] = [
  { label: "Select & move", keys: <Key>V</Key> },
  { label: "Pen", keys: <Key>P</Key> },
  { label: "Highlighter", keys: <Key>H</Key> },
  { label: "Line", keys: <Key>L</Key> },
  { label: "Arrow", keys: <Key>A</Key> },
  { label: "Rectangle", keys: <Key>R</Key> },
  { label: "Ellipse", keys: <Key>O</Key> },
  {
    label: "Pick color",
    keys: (
      <span className="flex items-center gap-1">
        <Key>1</Key>
        <Text variant="small" color="tertiary">
          –
        </Text>
        <Key>6</Key>
      </span>
    ),
  },
  {
    label: "Brush size",
    keys: (
      <span className="flex items-center gap-1">
        <Key>[</Key>
        <Key>]</Key>
      </span>
    ),
  },
  { label: "Delete selected shape", keys: <Key>⌫</Key> },
  { label: "Clear all", keys: <Key>C</Key> },
  {
    label: "Undo",
    keys: (
      <KeyGroup>
        <Key>⌘</Key>
        <Key>Z</Key>
      </KeyGroup>
    ),
  },
  {
    label: "Redo",
    keys: (
      <KeyGroup>
        <Key>⌘</Key>
        <Key>⇧</Key>
        <Key>Z</Key>
      </KeyGroup>
    ),
  },
  {
    label: "Straight line / snap shapes",
    keys: (
      <span className="flex items-center gap-1.5">
        <Text variant="small" color="tertiary">
          Hold
        </Text>
        <Key>⇧</Key>
      </span>
    ),
  },
  { label: "Hide/show toolbar", keys: <Key>T</Key> },
  {
    label: "Reset toolbar position",
    keys: (
      <KeyGroup>
        <Key>⇧</Key>
        <Key>T</Key>
      </KeyGroup>
    ),
  },
  { label: "Deselect / stop drawing", keys: <Key>Esc</Key> },
];

const MODIFIER_GLYPHS: Record<string, string> = {
  Command: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
};

function eventToAccelerator(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return null;

  const mods: string[] = [];
  if (e.metaKey) mods.push("Command");
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  // Require at least one modifier so the shortcut works globally without hijacking plain keys.
  if (mods.length === 0) return null;

  let keyName = e.key;
  if (keyName === " ") keyName = "Space";
  else if (keyName.length === 1) keyName = keyName.toUpperCase();

  return [...mods, keyName].join("+");
}

function ShortcutKeys({ accelerator }: { accelerator: string }) {
  const parts = accelerator.split("+");
  return (
    <KeyGroup>
      {parts.map((part, i) => (
        <Key key={`${part}-${i}`}>{MODIFIER_GLYPHS[part] ?? part}</Key>
      ))}
    </KeyGroup>
  );
}

export function HomeView() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.screenDraw.ipc.invoke<ScreenDrawSettings>("settings:get"),
  });

  const { data: shortcutStatus } = useQuery({
    queryKey: ["shortcutStatus"],
    queryFn: () => window.screenDraw.ipc.invoke<ShortcutStatus>("shortcut:getStatus"),
  });

  const shortcutMutation = useMutation({
    mutationFn: (shortcut: string) =>
      window.screenDraw.ipc.invoke<{
        settings: ScreenDrawSettings;
        registered: boolean;
        status: ShortcutStatus;
      }>("settings:setShortcut", shortcut),
    onSuccess: (next) => {
      queryClient.setQueryData(["settings"], next.settings);
      queryClient.setQueryData(["shortcutStatus"], next.status);
    },
    onError: (error) => toast.error(`Couldn't register shortcut: ${error}`),
  });

  // Startup registration failures are broadcast before this window loads, so the
  // initial query covers them; this keeps later changes in sync.
  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("shortcut:status-changed", (params) => {
      queryClient.setQueryData(["shortcutStatus"], params as ShortcutStatus);
    });
    return () => unsub();
  }, [queryClient]);

  const defaultsMutation = useMutation({
    mutationFn: (partial: { defaultColor?: string; defaultSize?: number; recentColor?: string }) =>
      window.screenDraw.ipc.invoke<ScreenDrawSettings>("settings:setDefaults", partial),
    onSuccess: (next) => queryClient.setQueryData(["settings"], next),
  });

  // Follow settings changes made elsewhere (e.g. colors picked in the overlay toolbar).
  useEffect(() => {
    const unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
      queryClient.setQueryData(["settings"], params as ScreenDrawSettings);
    });
    return () => unsub();
  }, [queryClient]);

  // Track overlay active state broadcast from the backend.
  useEffect(() => {
    void window.screenDraw.ipc
      .invoke<{ active: boolean }>("overlay:getState")
      .then((s) => setActive(s.active));
    const unsub = window.screenDraw.ipc.on("overlay:active-changed", (params) => {
      setActive(Boolean((params as { active?: boolean })?.active));
    });
    return () => unsub();
  }, []);

  // Capture the next key combination when the user is changing the shortcut.
  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      const accelerator = eventToAccelerator(e);
      if (accelerator) {
        shortcutMutation.mutate(accelerator);
        setCapturing(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capturing, shortcutMutation]);

  const toggleDrawing = () => {
    void window.screenDraw.ipc.invoke("overlay:setActive", !active);
  };

  const shortcut = settings?.shortcut ?? "Command+Shift+D";
  const color = settings?.defaultColor ?? PALETTE[0].value;
  const brushSize = settings?.defaultSize ?? 4;
  const recentColors = (settings?.recentColors ?? []).filter((c) => !isPaletteColor(c));

  return (
    <ScrollArea
      toolbar={
        <Toolbar>
          <ToolbarContent>
            <ToolbarTitle>Screen Draw</ToolbarTitle>
          </ToolbarContent>
        </Toolbar>
      }
    >
      <div className="flex flex-col gap-8 px-7 pb-8">
        <div className="flex flex-col gap-4">
          <Text color="secondary">
            Draw, highlight, and point anywhere on your screen — ideal for tutorials and screen
            recordings.
          </Text>
          <Button variant="accent" size="large" className="w-full" onClick={toggleDrawing}>
            {active ? "Stop drawing" : "Start drawing"}
          </Button>
          <div className="flex items-center justify-center gap-2">
            <Text variant="small" color="tertiary">
              or press
            </Text>
            <ShortcutKeys accelerator={shortcut} />
            <Text variant="small" color="tertiary">
              anywhere
            </Text>
          </div>
        </div>

        <Separator />

        <FieldSet title="Shortcut" description="Toggle drawing mode from any app.">
          <Field label="Activation shortcut">
            {capturing ? (
              <Button variant="filled" size="small" onClick={() => setCapturing(false)}>
                Press keys… (Esc to cancel)
              </Button>
            ) : (
              <div className="flex items-center gap-4">
                <ShortcutKeys accelerator={shortcut} />
                <Button
                  variant="transparent"
                  size="small"
                  className="text-lg font-bold"
                  onClick={() => setCapturing(true)}
                >
                  Change
                </Button>
              </div>
            )}
          </Field>
          {shortcutStatus?.failedAccelerator ? (
            <div
              role="alert"
              className="flex items-center gap-2.5 border-t border-white/8 px-7 py-4 text-[13px] font-semibold leading-snug text-amber-400"
            >
              <TriangleAlert className="size-4 shrink-0" />
              <span>
                Couldn't register <ShortcutKeys accelerator={shortcutStatus.failedAccelerator} /> —
                another app may already be using it. Choose a different shortcut.
              </span>
            </div>
          ) : null}
        </FieldSet>

        <FieldSet
          title="Defaults"
          description="The pen color and size used when drawing mode starts."
        >
          <Field label="Color">
            <div className="flex items-center gap-2">
              <SegmentedControl
                type="single"
                size="small"
                value={color}
                onValueChange={(value) => {
                  if (typeof value === "string" && value)
                    defaultsMutation.mutate({ defaultColor: value });
                }}
                aria-label="Default color"
              >
                {PALETTE.map((c) => (
                  <SegmentedControlItem key={c.value} value={c.value} iconOnly aria-label={c.name}>
                    <span className="size-5 rounded-full" style={{ backgroundColor: c.value }} />
                  </SegmentedControlItem>
                ))}
                {recentColors.map((c) => (
                  <SegmentedControlItem key={c} value={c} iconOnly aria-label={`Recent color ${c}`}>
                    <span className="size-5 rounded-full" style={{ backgroundColor: c }} />
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
              <ColorWell
                value={color}
                onChange={(value) => defaultsMutation.mutate({ defaultColor: value })}
                onCommit={(value) => {
                  if (!isPaletteColor(value)) defaultsMutation.mutate({ recentColor: value });
                }}
                size="small"
                aria-label="Custom default color"
              />
            </div>
          </Field>
          <Field label="Brush size">
            <Slider
              variant="filled"
              size="small"
              className="w-40"
              value={[brushSize]}
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={1}
              onValueChange={(value) => defaultsMutation.mutate({ defaultSize: value[0] })}
              startContent={<Pencil className="size-3.5" />}
              endContent={(v) => <span className="tabular-nums">{v}</span>}
              aria-label="Default brush size"
            />
          </Field>
        </FieldSet>

        <FieldSet
          title="Keyboard shortcuts"
          description="Available while drawing mode is on. Hover any toolbar control to see its key."
        >
          <div className="flex flex-col gap-2.5 px-7 py-5">
            {SHORTCUT_ROWS.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4">
                <Text variant="small" color="secondary">
                  {row.label}
                </Text>
                {row.keys}
              </div>
            ))}
          </div>
        </FieldSet>
      </div>
    </ScrollArea>
  );
}
