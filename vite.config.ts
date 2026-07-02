import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  build: {
    outDir: "build",
    emptyOutDir: true,
    target: "chrome150",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "main-window.html"),
        settings: resolve(__dirname, "settings-window.html"),
        overlay: resolve(__dirname, "overlay-window.html"),
        toolbar: resolve(__dirname, "toolbar-window.html"),
      },
    },
  },
  define: {
    __APP_DISPLAY_NAME__: JSON.stringify("Screen Draw"),
  },
});
