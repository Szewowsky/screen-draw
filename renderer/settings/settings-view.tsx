import { useCallback, useState, useEffect } from "react";
import {
  ColorWell,
  Label,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Slider,
  Switch,
  Toolbar,
  ToolbarContent,
  ToolbarTitle,
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldSet,
  toast,
} from "../components/ui";
import type { ScreenDrawSettings } from "../overlay/constants";
import type { NativeThemeInfo, ThemeSource } from "../../main/services/theme";

const DEFAULT_CURSOR_HIGHLIGHT: ScreenDrawSettings["cursorHighlight"] = {
  enabled: false,
  color: "#FFD60A",
  size: 60,
  opacity: 0.35,
};

const DEFAULT_SPOTLIGHT: ScreenDrawSettings["spotlight"] = {
  enabled: false,
  radius: 180,
  dimOpacity: 0.55,
};

export function SettingsView() {
  const [themeInfo, setThemeInfo] = useState<NativeThemeInfo | null>(null);
  const [_isLoading, setIsLoading] = useState(true);
  const [hideToolbarInRecordings, setHideToolbarInRecordings] = useState(false);
  const [cursorHighlight, setCursorHighlight] = useState(DEFAULT_CURSOR_HIGHLIGHT);
  const [spotlight, setSpotlight] = useState(DEFAULT_SPOTLIGHT);

  // Close settings window on Escape, unless an interactive element is focused or a popover is open
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;

      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }

      if (document.querySelector("[data-radix-popper-content-wrapper]")) {
        return;
      }

      event.preventDefault();
      window.screenDraw.ipc.invoke("window:closeSettings");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const refreshThemeInfo = async () => {
    try {
      const info = await window.screenDraw.nativeTheme.getInfo();
      setThemeInfo(info);
    } catch (error) {
      toast.error(`Failed to get theme info: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshThemeInfo();
  }, []);

  // Load persisted app settings and follow changes made elsewhere (e.g. tray
  // toggles or Shift+R while drawing).
  useEffect(() => {
    const applySettings = (settings: ScreenDrawSettings) => {
      setHideToolbarInRecordings(settings.hideToolbarInRecordings === true);
      setCursorHighlight(settings.cursorHighlight ?? DEFAULT_CURSOR_HIGHLIGHT);
      setSpotlight(settings.spotlight ?? DEFAULT_SPOTLIGHT);
    };

    void window.screenDraw.ipc
      .invoke<ScreenDrawSettings>("settings:get")
      .then(applySettings)
      .catch(() => {});
    const unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
      applySettings(params as ScreenDrawSettings);
    });
    return () => unsub();
  }, []);

  const handleThemeChange = async (value: string) => {
    const source = value as ThemeSource;
    try {
      await window.screenDraw.nativeTheme.setThemeSource(source);
      await refreshThemeInfo();
    } catch (error) {
      toast.error(`Failed to set theme: ${error}`);
    }
  };

  const handleHideToolbarChange = async (value: string) => {
    const next = value === "on";
    setHideToolbarInRecordings(next);
    try {
      await window.screenDraw.ipc.invoke("settings:setDefaults", {
        hideToolbarInRecordings: next,
      });
    } catch (error) {
      toast.error(`Failed to update setting: ${error}`);
    }
  };

  const updateCursorHighlight = useCallback(
    (partial: Partial<ScreenDrawSettings["cursorHighlight"]>) => {
      setCursorHighlight((current) => ({ ...current, ...partial }));
      void window.screenDraw.ipc
        .invoke<ScreenDrawSettings>("settings:setDefaults", {
          cursorHighlight: partial,
        })
        .then((settings) => setCursorHighlight(settings.cursorHighlight))
        .catch((error) => toast.error(`Failed to update cursor highlight: ${error}`));
    },
    [],
  );

  const updateSpotlight = useCallback((partial: Partial<ScreenDrawSettings["spotlight"]>) => {
    setSpotlight((current) => ({ ...current, ...partial }));
    void window.screenDraw.ipc
      .invoke<ScreenDrawSettings>("settings:setDefaults", {
        spotlight: partial,
      })
      .then((settings) => setSpotlight(settings.spotlight))
      .catch((error) => toast.error(`Failed to update spotlight: ${error}`));
  }, []);

  return (
    <ScrollArea
      toolbar={
        <Toolbar>
          <ToolbarContent>
            <ToolbarTitle>Settings</ToolbarTitle>
          </ToolbarContent>
        </Toolbar>
      }
    >
      <div className="px-4 flex flex-col gap-8 mb-8">
        <FieldSet>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="theme">Theme</FieldLabel>
              </FieldContent>
              <RadioGroup
                value={themeInfo?.themeSource ?? "system"}
                onValueChange={handleThemeChange}
                orientation="horizontal"
              >
                <Label>
                  <RadioGroupItem value="system" />
                  Auto
                </Label>
                <Label>
                  <RadioGroupItem value="light" />
                  Light
                </Label>
                <Label>
                  <RadioGroupItem value="dark" />
                  Dark
                </Label>
              </RadioGroup>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="hide-toolbar-in-recordings">
                  Hide toolbar in recordings
                </FieldLabel>
              </FieldContent>
              <RadioGroup
                value={hideToolbarInRecordings ? "on" : "off"}
                onValueChange={handleHideToolbarChange}
                orientation="horizontal"
              >
                <Label>
                  <RadioGroupItem value="off" />
                  Off
                </Label>
                <Label>
                  <RadioGroupItem value="on" />
                  On
                </Label>
              </RadioGroup>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet title="Cursor highlight">
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="cursor-highlight-enabled">Enabled</FieldLabel>
              </FieldContent>
              <Switch
                checked={cursorHighlight.enabled}
                onCheckedChange={(enabled) => void updateCursorHighlight({ enabled })}
                aria-label="Cursor highlight"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="cursor-highlight-color">Color</FieldLabel>
              </FieldContent>
              <ColorWell
                id="cursor-highlight-color"
                value={cursorHighlight.color}
                onChange={(color) => void updateCursorHighlight({ color })}
                size="small"
                aria-label="Cursor highlight color"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="cursor-highlight-size">Diameter</FieldLabel>
              </FieldContent>
              <Slider
                variant="filled"
                size="small"
                className="w-44"
                value={[cursorHighlight.size]}
                min={24}
                max={160}
                step={1}
                onValueChange={(value) => void updateCursorHighlight({ size: value[0] })}
                endContent={(value) => <span className="tabular-nums">{value}px</span>}
                endContentClassName="min-w-14"
                aria-label="Cursor highlight diameter"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="cursor-highlight-opacity">Opacity</FieldLabel>
              </FieldContent>
              <Slider
                variant="filled"
                size="small"
                className="w-44"
                value={[Math.round(cursorHighlight.opacity * 100)]}
                min={10}
                max={100}
                step={5}
                onValueChange={(value) =>
                  void updateCursorHighlight({ opacity: (value[0] ?? 35) / 100 })
                }
                endContent={(value) => <span className="tabular-nums">{value}%</span>}
                endContentClassName="min-w-14"
                aria-label="Cursor highlight opacity"
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet title="Spotlight">
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="spotlight-enabled">Enabled</FieldLabel>
              </FieldContent>
              <Switch
                checked={spotlight.enabled}
                onCheckedChange={(enabled) => void updateSpotlight({ enabled })}
                aria-label="Spotlight"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="spotlight-radius">Radius</FieldLabel>
              </FieldContent>
              <Slider
                variant="filled"
                size="small"
                className="w-44"
                value={[spotlight.radius]}
                min={80}
                max={360}
                step={5}
                onValueChange={(value) => void updateSpotlight({ radius: value[0] })}
                endContent={(value) => <span className="tabular-nums">{value}px</span>}
                endContentClassName="min-w-14"
                aria-label="Spotlight radius"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="spotlight-dim-opacity">Dim amount</FieldLabel>
              </FieldContent>
              <Slider
                variant="filled"
                size="small"
                className="w-44"
                value={[Math.round(spotlight.dimOpacity * 100)]}
                min={20}
                max={90}
                step={5}
                onValueChange={(value) =>
                  void updateSpotlight({ dimOpacity: (value[0] ?? 55) / 100 })
                }
                endContent={(value) => <span className="tabular-nums">{value}%</span>}
                endContentClassName="min-w-14"
                aria-label="Spotlight dim amount"
              />
            </Field>
          </FieldGroup>
        </FieldSet>
      </div>
    </ScrollArea>
  );
}
