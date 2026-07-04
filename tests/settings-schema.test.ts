import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  RECENT_COLORS_LIMIT,
  addRecentColor,
  coerceSettings,
} from "../main/services/settings-schema";
import { applySettingsDefaults } from "../main/services/settings-defaults";

describe("coerceSettings", () => {
  it("returns defaults for corrupt input", () => {
    for (const raw of [null, undefined, 42, "nonsense", []]) {
      expect(coerceSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("accepts a legacy settings file without the 1.1 keys", () => {
    const legacy = { shortcut: "Command+Shift+X", defaultColor: "#123456", defaultSize: 7 };
    expect(coerceSettings(legacy)).toEqual({
      ...legacy,
      toolbarPosition: null,
      toolbarPositionScope: "shared",
      toolbarPositionByDisplay: {},
      recentColors: [],
      hideToolbarInRecordings: false,
      cursorHighlight: DEFAULT_SETTINGS.cursorHighlight,
      spotlight: DEFAULT_SETTINGS.spotlight,
      effectsShortcuts: {},
    });
  });

  it("defaults legacy toolbar position scope to shared", () => {
    expect(coerceSettings({ toolbarPosition: { x: 12, y: 24 } }).toolbarPositionScope).toBe(
      "shared",
    );
  });

  it("coerces unknown toolbar position scopes to shared", () => {
    for (const raw of ["display", "global", true, null, 1, {}, []]) {
      expect(coerceSettings({ toolbarPositionScope: raw }).toolbarPositionScope).toBe("shared");
    }
  });

  it("round-trips per-display toolbar positions", () => {
    const result = coerceSettings({
      toolbarPositionScope: "per-display",
      toolbarPositionByDisplay: {
        "1": { x: 120, y: 40 },
        "2": { x: 320, y: 80 },
      },
    });
    expect(result.toolbarPositionScope).toBe("per-display");
    expect(result.toolbarPositionByDisplay).toEqual({
      "1": { x: 120, y: 40 },
      "2": { x: 320, y: 80 },
    });
  });

  it("defaults hideToolbarInRecordings to false when absent (legacy files)", () => {
    expect(coerceSettings({}).hideToolbarInRecordings).toBe(false);
    expect(coerceSettings({ shortcut: "Command+Shift+X" }).hideToolbarInRecordings).toBe(false);
  });

  it("keeps hideToolbarInRecordings only when strictly true", () => {
    expect(coerceSettings({ hideToolbarInRecordings: true }).hideToolbarInRecordings).toBe(true);
    // Truthy-but-not-true and non-booleans coerce to false.
    for (const raw of [1, "true", "yes", {}, [], null]) {
      expect(coerceSettings({ hideToolbarInRecordings: raw }).hideToolbarInRecordings).toBe(false);
    }
  });

  it("fills partial input with defaults per field", () => {
    const result = coerceSettings({ defaultSize: 12 });
    expect(result).toEqual({ ...DEFAULT_SETTINGS, defaultSize: 12 });
  });

  it("defaults presenter effects for legacy files", () => {
    expect(coerceSettings({}).cursorHighlight).toEqual({
      enabled: false,
      color: "#FFD60A",
      size: 60,
      opacity: 0.35,
    });
    expect(coerceSettings({}).spotlight).toEqual({
      enabled: false,
      radius: 180,
      dimOpacity: 0.55,
    });
    expect(coerceSettings({}).effectsShortcuts).toEqual({});
  });

  it("coerces presenter effect settings field-by-field", () => {
    expect(
      coerceSettings({
        cursorHighlight: { enabled: true, color: "#abcdef", size: 72, opacity: 0.5 },
        spotlight: { enabled: true, radius: 240, dimOpacity: 0.7 },
        effectsShortcuts: { highlight: "Command+Option+H", spotlight: "Command+Option+S" },
      }),
    ).toMatchObject({
      cursorHighlight: { enabled: true, color: "#abcdef", size: 72, opacity: 0.5 },
      spotlight: { enabled: true, radius: 240, dimOpacity: 0.7 },
      effectsShortcuts: { highlight: "Command+Option+H", spotlight: "Command+Option+S" },
    });
  });

  it("rejects invalid presenter effect values individually", () => {
    const result = coerceSettings({
      cursorHighlight: { enabled: "yes", color: "gold", size: 0, opacity: 2 },
      spotlight: { enabled: 1, radius: -1, dimOpacity: Number.NaN },
      effectsShortcuts: { highlight: "   ", spotlight: null },
    });
    expect(result.cursorHighlight).toEqual(DEFAULT_SETTINGS.cursorHighlight);
    expect(result.spotlight).toEqual(DEFAULT_SETTINGS.spotlight);
    expect(result.effectsShortcuts).toEqual({});
  });

  it("rejects invalid field values individually", () => {
    const result = coerceSettings({
      shortcut: "   ",
      defaultColor: "",
      defaultSize: -3,
      toolbarPosition: { x: "left", y: 10 },
      toolbarPositionScope: "mystery",
      toolbarPositionByDisplay: {
        "1": { x: "left", y: 20 },
      },
      recentColors: "red",
    });
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps a valid toolbar position", () => {
    const result = coerceSettings({ toolbarPosition: { x: 120, y: 40 } });
    expect(result.toolbarPosition).toEqual({ x: 120, y: 40 });
  });

  it("rejects non-finite toolbar coordinates", () => {
    expect(coerceSettings({ toolbarPosition: { x: Infinity, y: 40 } }).toolbarPosition).toBeNull();
    expect(coerceSettings({ toolbarPosition: { x: 10, y: NaN } }).toolbarPosition).toBeNull();
  });

  it("keeps only valid hex colors in recentColors, deduplicated and capped", () => {
    const raw = ["#ab12cd", "not-a-color", "#AB12CD", "#fff", "#123456", "#654321", "#111111"];
    const result = coerceSettings({ recentColors: raw });
    expect(result.recentColors).toHaveLength(RECENT_COLORS_LIMIT);
    expect(result.recentColors).toEqual(["#ab12cd", "#fff", "#123456", "#654321"]);
  });
});

describe("addRecentColor", () => {
  it("prepends a new color", () => {
    expect(addRecentColor(["#111111"], "#222222")).toEqual(["#222222", "#111111"]);
  });

  it("moves an existing color to the front instead of duplicating (case-insensitive)", () => {
    expect(addRecentColor(["#111111", "#ABCDEF"], "#abcdef")).toEqual(["#abcdef", "#111111"]);
  });

  it("caps the list, dropping the oldest color", () => {
    let recent: string[] = [];
    for (let i = 1; i <= RECENT_COLORS_LIMIT + 1; i++) {
      recent = addRecentColor(recent, `#11111${i}`);
    }
    expect(recent).toHaveLength(RECENT_COLORS_LIMIT);
    expect(recent[0]).toBe(`#11111${RECENT_COLORS_LIMIT + 1}`);
    expect(recent).not.toContain("#111111");
  });

  it("ignores values that are not hex colors", () => {
    expect(addRecentColor(["#111111"], "tomato")).toEqual(["#111111"]);
  });
});

describe("applySettingsDefaults", () => {
  it("flips the toolbar recording flag atomically from the current settings", () => {
    expect(
      applySettingsDefaults(
        { ...DEFAULT_SETTINGS, hideToolbarInRecordings: false },
        { toggleHideToolbarInRecordings: true },
      ).hideToolbarInRecordings,
    ).toBe(true);

    expect(
      applySettingsDefaults(
        { ...DEFAULT_SETTINGS, hideToolbarInRecordings: true },
        { toggleHideToolbarInRecordings: true },
      ).hideToolbarInRecordings,
    ).toBe(false);
  });

  it("flips presenter effect enabled flags while preserving the rest of each effect", () => {
    const current = {
      ...DEFAULT_SETTINGS,
      cursorHighlight: {
        enabled: false,
        color: "#abcdef",
        size: 72,
        opacity: 0.5,
      },
      spotlight: {
        enabled: true,
        radius: 240,
        dimOpacity: 0.7,
      },
    };

    expect(
      applySettingsDefaults(current, {
        toggleCursorHighlight: true,
        toggleSpotlight: true,
      }),
    ).toMatchObject({
      cursorHighlight: {
        enabled: true,
        color: "#abcdef",
        size: 72,
        opacity: 0.5,
      },
      spotlight: {
        enabled: false,
        radius: 240,
        dimOpacity: 0.7,
      },
    });
  });

  it("lets atomic presenter-effect flips win over explicit enabled values", () => {
    const current = {
      ...DEFAULT_SETTINGS,
      cursorHighlight: {
        ...DEFAULT_SETTINGS.cursorHighlight,
        enabled: true,
      },
      spotlight: {
        ...DEFAULT_SETTINGS.spotlight,
        enabled: false,
      },
    };

    expect(
      applySettingsDefaults(current, {
        cursorHighlight: { enabled: true },
        toggleCursorHighlight: true,
        spotlight: { enabled: false },
        toggleSpotlight: true,
      }),
    ).toMatchObject({
      cursorHighlight: { enabled: false },
      spotlight: { enabled: true },
    });
  });
});
