import { describe, expect, it } from "vitest";
import {
  ADOPTABLE_TOOLS,
  OVERLAY_TOOLS,
  TOOL_KEYS,
  TOOL_REGISTRY,
} from "../renderer/overlay/constants";

describe("tool registry derivations", () => {
  it("derives key and membership lookups from TOOL_REGISTRY", () => {
    const registryTools = TOOL_REGISTRY.map((entry) => entry.tool);
    const registryKeys = TOOL_REGISTRY.map((entry) => entry.key.toLowerCase());

    expect(new Set(registryTools).size).toBe(TOOL_REGISTRY.length);
    expect(Object.keys(TOOL_KEYS).sort()).toEqual([...registryKeys].sort());

    for (const entry of TOOL_REGISTRY) {
      expect(TOOL_KEYS[entry.key.toLowerCase()]).toBe(entry.tool);
      expect(OVERLAY_TOOLS.has(entry.tool)).toBe(true);
      expect(ADOPTABLE_TOOLS.has(entry.tool)).toBe(entry.adoptable);
    }
  });
});
