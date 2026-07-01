import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Use unique names to avoid conflicts with esbuild's CommonJS shims
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

// Backend files live in build/main/**. HTML entry points live directly in build/.
const BUILD_ROOT = path.resolve(currentDirPath, "../..");

/**
 * Absolute path to the build directory that contains HTML entry points.
 */
export function getBuildRoot(): string {
  return BUILD_ROOT;
}

/**
 * Resolve the on-disk HTML file for a given window.
 */
export function resolveWindowHtml(htmlFileName: string): string {
  return path.join(BUILD_ROOT, htmlFileName);
}

/**
 * Return a file:// URL for a locally built HTML file.
 */
export function getWindowFileUrl(htmlFileName: string): string {
  return pathToFileURL(resolveWindowHtml(htmlFileName)).toString();
}

/**
 * Absolute path to the built preload script.
 *
 * The preload is built separately as a CommonJS bundle because Electron expects
 * a preload script path, not an ES module entry.
 */
export function getPreloadPath(): string {
  return path.join(BUILD_ROOT, "preload", "preload.cjs");
}

/**
 * Resolve the correct URL for a window, preferring the dev server when available.
 */
export async function getWindowUrl(htmlFileName: string): Promise<string> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl.replace(/\/$/, "")}/${htmlFileName}`;
  }

  return getWindowFileUrl(htmlFileName);
}
