import { describe, expect, it } from "vitest";
import { resolveEffectiveTheme } from "../main/services/theme";

describe("resolveEffectiveTheme", () => {
  it("follows a dark system appearance in system mode", () => {
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
  });

  it("follows a light system appearance in system mode", () => {
    expect(resolveEffectiveTheme("system", false)).toBe("light");
  });

  it("keeps an explicit light theme when the system is dark", () => {
    expect(resolveEffectiveTheme("light", true)).toBe("light");
  });

  it("keeps an explicit dark theme when the system is light", () => {
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
  });
});
