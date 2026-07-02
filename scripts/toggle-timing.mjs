/* global console, performance, process, setTimeout, URL */
// Timing harness: measures Screen Draw overlay activation latency.
// Usage: npx electron scripts/toggle-timing.mjs <repo-root-with-build>
//
// Boots the app's built main modules directly, toggles drawing mode, and reports:
// - main-side await toggleOverlay() duration
// - per-renderer latency from overlay:active-changed { active: true } to the
//   first and second requestAnimationFrame callbacks
import { app, BrowserWindow } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";

const root = process.argv[2];
if (!root) {
  console.error("[TIMING] missing repo root arg");
  process.exit(1);
}

const buildMain = path.join(root, "build", "main");
if (!fs.existsSync(buildMain)) {
  console.error(`[TIMING] missing build/main at ${buildMain}; run npm run build first`);
  process.exit(1);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "screen-draw-timing-"));
app.setPath("userData", userData);

const ITERATIONS = 4;
const SETTLE_MS = 500;
const VISIBLE_MS = 600;
const HIDDEN_MS = 600;
const STEP_TIMEOUT_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeout(label, ms = STEP_TIMEOUT_MS) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
}

function withTimeout(label, promise, ms = STEP_TIMEOUT_MS) {
  return Promise.race([promise, timeout(label, ms)]);
}

function mod(modulePath) {
  return import(pathToFileURL(path.join(buildMain, modulePath)).href);
}

function label(win) {
  const url = win.webContents.getURL();
  if (!url) return `window-${win.id}`;
  const parsed = new URL(url);
  const file = parsed.pathname.split("/").pop() || `window-${win.id}`;
  const displayId = parsed.searchParams.get("displayId");
  return displayId ? `${file}#${displayId}` : file;
}

async function installRendererTiming(win) {
  await withTimeout(
    `install timing in ${label(win)}`,
    win.webContents.executeJavaScript(`
      window.__timing = [];
      window.__timingLabel = ${JSON.stringify(label(win))};
      if (window.screenDraw?.ipc?.on) {
        window.screenDraw.ipc.on('overlay:active-changed', (p) => {
          if (!p || p.active !== true) return;
          const t0 = performance.now();
          requestAnimationFrame(() => {
            const sample = { raf1: +(performance.now() - t0).toFixed(1), raf2: null };
            window.__timing.push(sample);
            requestAnimationFrame(() => {
              sample.raf2 = +(performance.now() - t0).toFixed(1);
            });
          });
        });
      }
      true;
    `),
  );
}

async function readRendererTiming(win) {
  return await withTimeout(
    `read timing from ${label(win)}`,
    win.webContents.executeJavaScript("window.__timing ?? null"),
  ).catch((error) => ({ error: String(error?.message ?? error) }));
}

async function main() {
  await withTimeout("app.whenReady", app.whenReady(), 10000);
  app.dock?.hide();

  const [{ registerHandlers }, { createOverlayWindow, toggleOverlay }] = await Promise.all([
    mod("handlers/index.js"),
    mod("windows/overlay-window.js"),
  ]);

  registerHandlers();
  await withTimeout("createOverlayWindow", createOverlayWindow(), 10000);
  await sleep(SETTLE_MS);

  const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
  if (windows.length === 0) throw new Error("No BrowserWindow instances created");

  await Promise.all(windows.map((win) => installRendererTiming(win)));

  const toggles = [];
  let rendererTimings = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const t0 = performance.now();
    await withTimeout(`toggleOverlay enter ${i + 1}`, toggleOverlay());
    toggles.push(+(performance.now() - t0).toFixed(1));
    await sleep(VISIBLE_MS);
    if (i === ITERATIONS - 1) {
      rendererTimings = await Promise.all(
        windows.map(async (win) => ({ label: label(win), timing: await readRendererTiming(win) })),
      );
    }
    await withTimeout(`toggleOverlay exit ${i + 1}`, toggleOverlay());
    await sleep(HIDDEN_MS);
  }

  console.log(`[TIMING] root=${root}`);
  console.log(`[TIMING] windows=${windows.map(label).join(", ")}`);
  console.log(`[TIMING] toggleOverlay(main-side) ms per iteration: ${JSON.stringify(toggles)}`);
  for (const { label: windowLabel, timing } of rendererTimings) {
    console.log(`[TIMING] ${windowLabel} active->raf ms: ${JSON.stringify(timing)}`);
  }
}

main()
  .then(() => app.quit())
  .catch((error) => {
    console.error(`[TIMING] ERROR ${error?.stack ?? error}`);
    app.exit(1);
  });
