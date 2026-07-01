/// <reference types="vite/client" />

import type { ScreenDrawAPI } from "./preload";

declare global {
  interface Window {
    screenDraw: ScreenDrawAPI;
  }
}
