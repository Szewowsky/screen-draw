import { describe, expect, it } from "vitest";
import { initialShortcutStatus, recordRegistrationResult } from "../main/services/shortcut-status";

describe("shortcut registration status", () => {
  it("starts with nothing registered and nothing to warn about", () => {
    expect(initialShortcutStatus()).toEqual({
      registeredAccelerator: null,
      failedAccelerator: null,
    });
  });

  it("records a successful registration", () => {
    expect(recordRegistrationResult("Command+Shift+D", true)).toEqual({
      registeredAccelerator: "Command+Shift+D",
      failedAccelerator: null,
    });
  });

  it("records a failed registration with the accelerator to warn about", () => {
    expect(recordRegistrationResult("Command+Shift+4", false)).toEqual({
      registeredAccelerator: null,
      failedAccelerator: "Command+Shift+4",
    });
  });

  it("clears the warning when re-registration after a failure succeeds", () => {
    recordRegistrationResult("Command+Shift+4", false);
    expect(recordRegistrationResult("Command+Shift+D", true)).toEqual({
      registeredAccelerator: "Command+Shift+D",
      failedAccelerator: null,
    });
  });

  it("replaces a working shortcut with a warning when the new one fails", () => {
    recordRegistrationResult("Command+Shift+D", true);
    expect(recordRegistrationResult("Command+Shift+4", false)).toEqual({
      registeredAccelerator: null,
      failedAccelerator: "Command+Shift+4",
    });
  });
});
