import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  RECENT_COLORS_LIMIT,
  addRecentColor,
  coerceSettings,
} from "../main/services/settings-schema";

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
      recentColors: [],
      hideToolbarInRecordings: false,
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

  it("rejects invalid field values individually", () => {
    const result = coerceSettings({
      shortcut: "   ",
      defaultColor: "",
      defaultSize: -3,
      toolbarPosition: { x: "left", y: 10 },
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
