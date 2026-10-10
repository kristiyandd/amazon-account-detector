import { afterEach, describe, expect, it, vi } from "vitest";
import { watchDebugFlag } from "./debug-flag";
import { logDebug, setDebugLogging } from "./log";
import type { DebugChanges } from "./debug-flag";

type Listener = Parameters<DebugChanges["addListener"]>[0];

function fakeEvents(): { readonly events: DebugChanges; readonly fire: Listener } {
  let registered: Listener | undefined;
  return {
    events: {
      addListener: (listener) => {
        registered = listener;
      },
    },
    fire: (changes, areaName) => {
      registered?.(changes, areaName);
    },
  };
}

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("watchDebugFlag", () => {
  afterEach(() => {
    setDebugLogging(false);
    vi.restoreAllMocks();
  });

  it("switches debug logging on from the stored flag and follows later changes", async () => {
    const debug = vi.spyOn(console, "debug").mockReturnValue(undefined);
    const { events, fire } = fakeEvents();
    watchDebugFlag({ get: () => Promise.resolve({ debug: true }) }, events);
    await flush();
    logDebug("one");
    fire({ debug: { newValue: false } }, "local");
    logDebug("two");
    fire({ debug: { newValue: true } }, "session");
    logDebug("three");
    expect(debug.mock.calls).toEqual([["[account-detector] one"]]);
  });

  it("treats anything but the boolean true as off, and ignores a failing read", async () => {
    const debug = vi.spyOn(console, "debug").mockReturnValue(undefined);
    watchDebugFlag({ get: () => Promise.resolve({ debug: "yes" }) }, fakeEvents().events);
    await flush();
    logDebug("a");
    watchDebugFlag({ get: () => Promise.reject(new Error("storage down")) }, fakeEvents().events);
    await flush();
    logDebug("b");
    expect(debug).not.toHaveBeenCalled();
  });

  it("does not let a slow initial read overwrite a newer change", async () => {
    const debug = vi.spyOn(console, "debug").mockReturnValue(undefined);
    const { events, fire } = fakeEvents();
    watchDebugFlag({ get: () => Promise.resolve({ debug: false }) }, events);
    fire({ debug: { newValue: true } }, "local");
    await flush();
    logDebug("kept");
    expect(debug).toHaveBeenCalledTimes(1);
  });
});
