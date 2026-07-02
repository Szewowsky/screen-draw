/**
 * IPC handlers that bridge the dedicated toolbar window and the drawing overlays.
 *
 * There is no renderer-to-renderer traffic; everything is relayed through main
 * in the existing broadcast style. The protocol is deliberately small:
 *
 * - `toolbar:publishState` (active overlay → main): the active overlay pushes its
 *   full toolbar-facing state (tool/color/size/recentColors/history/ghost). Main
 *   caches it (so a toolbar showing after being hidden, or after a display
 *   switch, can seed itself) and re-broadcasts it as `toolbar:state`. The active
 *   overlay also stamps the active display's work area onto the payload so the
 *   toolbar can clamp its position display-relative.
 * - `toolbar:state` (main → all): the toolbar window applies it; overlays ignore it.
 * - `toolbar:getState` (toolbar → main): returns the cached state on mount/show.
 * - `toolbar:action` (toolbar → main): a user action from the toolbar buttons,
 *   `{ type, ... }`. Main re-broadcasts it as `toolbar:action`; only the active
 *   display's overlay applies it (reusing the overlay's isThisActiveDisplay
 *   guard). A few actions are window management and handled here in main instead
 *   of being relayed: `toggleHidden` (the `T` behavior, now hiding the toolbar
 *   WINDOW), and `setBounds` (the drag/measure/popover-resize that sizes and
 *   positions the toolbar window).
 */

import { ipcMain } from "electron";

import { broadcast } from "../services/events.js";
import { getActiveDisplayId, focusActiveOverlay } from "../windows/overlay-window.js";
import {
  getActiveWorkArea,
  setToolbarBounds,
  toggleToolbarHidden,
} from "../windows/toolbar-window.js";

/** Last full toolbar state published by the active overlay; seeds the toolbar on show. */
let cachedState: Record<string, unknown> = {};

function withWorkArea(state: Record<string, unknown>): Record<string, unknown> {
  const wa = getActiveWorkArea(getActiveDisplayId());
  return { ...state, workArea: { x: wa.x, y: wa.y, width: wa.width, height: wa.height } };
}

export function registerToolbarHandlers(): void {
  ipcMain.handle("toolbar:publishState", async (_event, state: unknown) => {
    cachedState = typeof state === "object" && state !== null ? { ...state } : {};
    broadcast("toolbar:state", withWorkArea(cachedState));
  });

  ipcMain.handle("toolbar:getState", async () => {
    return withWorkArea(cachedState);
  });

  ipcMain.handle("toolbar:setBounds", async (_event, request: unknown) => {
    const r = (request ?? {}) as { width?: unknown; height?: unknown; x?: unknown; y?: unknown };
    if (
      typeof r.width !== "number" ||
      typeof r.height !== "number" ||
      typeof r.x !== "number" ||
      typeof r.y !== "number"
    ) {
      throw new Error("toolbar:setBounds expects numeric width/height/x/y");
    }
    setToolbarBounds(getActiveDisplayId(), { width: r.width, height: r.height, x: r.x, y: r.y });
  });

  ipcMain.handle("toolbar:action", async (_event, action: unknown) => {
    const type =
      typeof action === "object" && action !== null
        ? (action as { type?: unknown }).type
        : undefined;

    // Window-management actions handled locally; not relayed to overlays.
    if (type === "toggleHidden") {
      toggleToolbarHidden(getActiveDisplayId());
      return;
    }

    // Everything else is a drawing action for the active overlay. Refocus the
    // active overlay first: clicking a toolbar button moves keyboard focus to
    // the toolbar window, which would otherwise starve the overlay's single-key
    // shortcuts. (The popover keeps focus itself while open — it never routes
    // through here mid-edit.)
    focusActiveOverlay();
    broadcast("toolbar:action", action);
  });
}
