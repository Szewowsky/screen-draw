import { describe, expect, it } from "vitest";
import {
  INITIAL_UPDATE_NOTIFICATION_STATE,
  reduceUpdateNotification,
} from "../main/services/update-state";

describe("reduceUpdateNotification", () => {
  it("tracks a successful update from check through download", () => {
    const checking = reduceUpdateNotification(INITIAL_UPDATE_NOTIFICATION_STATE, {
      type: "checking",
    });
    expect(checking).toEqual({ status: "checking" });

    const available = reduceUpdateNotification(checking, {
      type: "available",
      version: "1.9.1",
    });
    expect(available).toEqual({ status: "available", version: "1.9.1" });

    const downloading = reduceUpdateNotification(available, { type: "download-progress" });
    expect(downloading).toEqual({ status: "downloading", version: "1.9.1" });

    const downloaded = reduceUpdateNotification(downloading, {
      type: "downloaded",
      version: "1.9.1",
    });
    expect(downloaded).toEqual({ status: "downloaded", version: "1.9.1" });
  });

  it("returns to idle when the installed version is current", () => {
    const checking = reduceUpdateNotification(INITIAL_UPDATE_NOTIFICATION_STATE, {
      type: "checking",
    });
    expect(reduceUpdateNotification(checking, { type: "not-available" })).toEqual({
      status: "idle",
    });
  });

  it("turns an updater failure into a silent error state without throwing", () => {
    expect(() =>
      reduceUpdateNotification({ status: "downloading", version: "1.9.1" }, { type: "error" }),
    ).not.toThrow();
    expect(
      reduceUpdateNotification({ status: "downloading", version: "1.9.1" }, { type: "error" }),
    ).toEqual({ status: "error" });
  });

  it("ignores download progress until an available version is known", () => {
    expect(
      reduceUpdateNotification(INITIAL_UPDATE_NOTIFICATION_STATE, {
        type: "download-progress",
      }),
    ).toEqual(INITIAL_UPDATE_NOTIFICATION_STATE);
  });
});
