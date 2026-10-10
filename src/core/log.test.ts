import { afterEach, describe, expect, it, vi } from "vitest";
import { logDebug, logError, logWarn, maskEmails, setDebugLogging } from "./log";

describe("log", () => {
  afterEach(() => {
    setDebugLogging(false);
    vi.restoreAllMocks();
  });

  it("masks every address so no email reaches the console", () => {
    expect(maskEmails("user test.user@example.com and b@example.org")).toBe(
      "user t***@example.com and b***@example.org",
    );
  });

  it("writes masked warnings and errors", () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    logWarn("check for test.user@example.com failed");
    logError("boom", new Error("bad test.user@example.com"));
    logError("boom", "not an error");
    expect(warn).toHaveBeenCalledWith("[account-detector] check for t***@example.com failed");
    expect(error).toHaveBeenCalledWith("[account-detector] boom: Error: bad t***@example.com");
    expect(error).toHaveBeenCalledWith("[account-detector] boom: non-Error value");
  });

  it("keeps debug lines silent until debug logging is switched on", () => {
    const debug = vi.spyOn(console, "debug");
    logDebug("check us: attempt 1");
    expect(debug).not.toHaveBeenCalled();
  });

  it("prints masked debug lines while enabled and goes silent again when switched off", () => {
    const debug = vi.spyOn(console, "debug").mockReturnValue(undefined);
    setDebugLogging(true);
    logDebug("claim test.user@example.com");
    expect(debug).toHaveBeenCalledExactlyOnceWith("[account-detector] claim t***@example.com");
    setDebugLogging(false);
    logDebug("hidden");
    expect(debug).toHaveBeenCalledTimes(1);
  });
});
