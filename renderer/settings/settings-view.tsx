import { useState, useEffect } from "react";
import {
  Label,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
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

type NativeThemeInfo = {
  themeSource: "system" | "light" | "dark";
  shouldUseDarkColors: boolean;
};

type ScreenDrawSettings = {
  hideToolbarInRecordings: boolean;
};

export function SettingsView() {
  const [themeInfo, setThemeInfo] = useState<NativeThemeInfo | null>(null);
  const [_isLoading, setIsLoading] = useState(true);
  const [hideToolbarInRecordings, setHideToolbarInRecordings] = useState(false);

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

  // Load the recording toggle and follow changes made elsewhere (e.g. Shift+R
  // while drawing).
  useEffect(() => {
    void window.screenDraw.ipc
      .invoke<ScreenDrawSettings>("settings:get")
      .then((s) => setHideToolbarInRecordings(s.hideToolbarInRecordings === true))
      .catch(() => {});
    const unsub = window.screenDraw.ipc.on("settings:changed", (params) => {
      setHideToolbarInRecordings((params as ScreenDrawSettings).hideToolbarInRecordings === true);
    });
    return () => unsub();
  }, []);

  const handleThemeChange = async (value: string) => {
    const source = value as "system" | "light" | "dark";
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
      </div>
    </ScrollArea>
  );
}
