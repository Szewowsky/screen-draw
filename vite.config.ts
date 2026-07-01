import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "main-window.html"),
        settings: resolve(__dirname, "settings-window.html"),
        overlay: resolve(__dirname, "overlay-window.html"),
      },
    },
  },
  define: {
    __APP_DISPLAY_NAME__: JSON.stringify("Screen Draw"),
  },
});
