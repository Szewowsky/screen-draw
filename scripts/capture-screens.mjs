/* global console, process, setTimeout */
// Screenshot harness for README/marketing assets.
// Usage: npx electron scripts/capture-screens.mjs <repo-root-with-build>
//
// Boots the built main modules, drives window state programmatically (NO
// synthetic user input), paints a demo annotation scene directly onto the
// overlay canvas (pixels only — the drawing model is untouched), and saves
// window captures via webContents.capturePage() into docs/assets/.
import { app, BrowserWindow } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";

const root = process.argv[2];
if (!root) {
  console.error("[SHOT] missing repo root arg");
  process.exit(1);
}
const buildMain = path.join(root, "build", "main");
if (!fs.existsSync(buildMain)) {
  console.error(`[SHOT] missing build/main at ${buildMain}; run npm run build first`);
  process.exit(1);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "screen-draw-shots-"));
app.setPath("userData", userData);

const outDir = path.join(root, "docs", "assets");
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mod = (p) => import(pathToFileURL(path.join(buildMain, p)).href);

async function save(win, name, maxWidth = 1600) {
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  const resized = size.width > maxWidth ? image.resize({ width: maxWidth }) : image;
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, resized.toPNG());
  console.log(`[SHOT] ${name}.png ${resized.getSize().width}x${resized.getSize().height}`);
}

// Demo scene painted straight onto the overlay <canvas> — presentation pixels
// only, so nothing enters the model/undo. Runs inside the overlay renderer.
const DEMO_SCENE = `
(() => {
  const canvas = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const w = window.innerWidth, h = window.innerHeight;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#1c1c27");
  bg.addColorStop(0.55, "#232336");
  bg.addColorStop(1, "#191922");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Highlighter band under a fake headline area.
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#FFD60A";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(w * 0.16, h * 0.24);
  ctx.quadraticCurveTo(w * 0.30, h * 0.235, w * 0.46, h * 0.243);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Smooth pen scribble (midpoint curves, like the real renderer).
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push({
      x: w * (0.18 + 0.22 * t),
      y: h * (0.55 + 0.10 * Math.sin(t * Math.PI * 2.2)),
    });
  }
  ctx.strokeStyle = "#FF453A";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.stroke();

  // Rectangle callout + arrow into it.
  ctx.strokeStyle = "#0A84FF";
  ctx.lineWidth = 4;
  ctx.strokeRect(w * 0.55, h * 0.34, w * 0.24, h * 0.20);
  const ax = w * 0.46, ay = h * 0.70, bx = w * 0.585, by = h * 0.545;
  ctx.strokeStyle = "#30D158";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  const ang = Math.atan2(by - ay, bx - ax), head = 22;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - head * Math.cos(ang - Math.PI / 6), by - head * Math.sin(ang - Math.PI / 6));
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - head * Math.cos(ang + Math.PI / 6), by - head * Math.sin(ang + Math.PI / 6));
  ctx.stroke();

  // Text annotation.
  ctx.fillStyle = "#FFD60A";
  ctx.font = "600 " + Math.round(h * 0.032) + "px -apple-system, sans-serif";
  ctx.fillText("Click here first!", w * 0.565, h * 0.315);

  // Laser stroke with glow.
  ctx.save();
  ctx.strokeStyle = "#FF453A";
  ctx.shadowColor = "#FF453A";
  ctx.shadowBlur = 18 * (window.devicePixelRatio || 1);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.62, h * 0.72);
  ctx.quadraticCurveTo(w * 0.70, h * 0.64, w * 0.80, h * 0.74);
  ctx.stroke();
  ctx.restore();

  // Spotlight-style vignette in a corner to hint the effect.
  const spot = ctx.createRadialGradient(
    w * 0.30, h * 0.55, h * 0.16,
    w * 0.30, h * 0.55, h * 0.55,
  );
  spot.addColorStop(0, "rgba(0,0,0,0)");
  spot.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);
  return true;
})();
`;

async function run() {
  await app.whenReady();
  app.dock?.hide();

  const { registerHandlers } = await mod("handlers/index.js");
  const { createOverlayWindow, toggleOverlay } = await mod("windows/overlay-window.js");
  const { getToolbarWindow } = await mod("windows/toolbar-window.js");
  const { openSettingsWindow, getSettingsWindow } = await mod("windows/settings-window.js");
  const { getWindowUrl, getPreloadPath } = await mod("windows/window-paths.js");

  registerHandlers();
  await createOverlayWindow();
  await sleep(800);
  await toggleOverlay(); // -> drawing: overlays + toolbar visible
  await sleep(900);

  const overlay = BrowserWindow.getAllWindows().find((win) =>
    win.webContents.getURL().includes("overlay-window.html"),
  );
  if (overlay) {
    await overlay.webContents.executeJavaScript(DEMO_SCENE);
    await sleep(300);
    await save(overlay, "hero-annotations", 1800);
  }

  const toolbar = getToolbarWindow();
  if (toolbar && !toolbar.isDestroyed()) {
    await save(toolbar, "toolbar", 1200);
  }

  await toggleOverlay(); // hide overlays before capturing panel windows
  await sleep(300);

  const panel = new BrowserWindow({
    width: 460,
    height: 640,
    show: false,
    backgroundColor: "#111111",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await panel.loadURL(await getWindowUrl("main-window.html"));
  panel.showInactive();
  await sleep(1200);
  await save(panel, "control-panel", 920);

  await openSettingsWindow();
  await sleep(1200);
  const settings = getSettingsWindow?.();
  if (settings && !settings.isDestroyed()) {
    await save(settings, "settings", 920);
  }

  console.log(`[SHOT] done -> ${outDir}`);
  app.quit();
}

run().catch((error) => {
  console.error("[SHOT] failed", error);
  app.exit(1);
});
