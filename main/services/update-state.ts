export type UpdateNotificationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string }
  | { status: "downloaded"; version: string }
  | { status: "error" };

export type UpdateNotificationEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "download-progress" }
  | { type: "downloaded"; version: string }
  | { type: "not-available" }
  | { type: "error" };

export const INITIAL_UPDATE_NOTIFICATION_STATE: UpdateNotificationState = { status: "idle" };

/** Reduce electron-updater lifecycle events into renderer-safe notification state. */
export function reduceUpdateNotification(
  state: UpdateNotificationState,
  event: UpdateNotificationEvent,
): UpdateNotificationState {
  switch (event.type) {
    case "checking":
      return { status: "checking" };
    case "available":
      return { status: "available", version: event.version };
    case "download-progress":
      return state.status === "available" || state.status === "downloading"
        ? { status: "downloading", version: state.version }
        : state;
    case "downloaded":
      return { status: "downloaded", version: event.version };
    case "not-available":
      return INITIAL_UPDATE_NOTIFICATION_STATE;
    case "error":
      return { status: "error" };
  }
}
