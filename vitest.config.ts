import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only pure, Electron/DOM-free modules are unit tested.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
