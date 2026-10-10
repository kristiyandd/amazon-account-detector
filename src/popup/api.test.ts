import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDebugLogging, setDebugLogging } from "@/core/log";
import { ACCOUNT_HASH, OTHER_HASH, STORED_HINT } from "@/test/data";
import {
  activeTabMarketplace,
  readSnapshot,
  requestCheck,
  saveExpected,
  subscribe,
  watchDebugLogging,
} from "./api";

const sendMessage = vi.fn<(message: unknown) => Promise<unknown>>();
const sessionGet = vi.fn<(keys: string[]) => Promise<Record<string, unknown>>>();
const localGet = vi.fn<(keys: string[]) => Promise<Record<string, unknown>>>();
const localSet = vi.fn<(items: Record<string, unknown>) => Promise<void>>();
const addListener = vi.fn<(listener: (changes: unknown, area: string) => void) => void>();
const query = vi.fn<(info: unknown) => Promise<{ url?: string }[]>>();
const removeListener = vi.fn<(listener: (changes: unknown, area: string) => void) => void>();

beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: { sendMessage },
    tabs: { query },
    storage: {
      session: { get: sessionGet },
      local: { get: localGet, set: localSet },
      onChanged: { addListener, removeListener },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("popup api", () => {
  it("names the marketplace of the active tab in this window when it is an Amazon site", async () => {
    query.mockResolvedValue([{ url: "https://www.amazon.de/gp/cart/view.html" }]);
    expect(await activeTabMarketplace()).toBe("de");
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it("names no marketplace when Chrome hides the URL of a non-Amazon tab", async () => {
    query.mockResolvedValue([{}]);
    expect(await activeTabMarketplace()).toBeUndefined();
  });

  it("names no marketplace when the tab query fails, so the popup still opens", async () => {
    query.mockRejectedValue(new Error("no window"));
    expect(await activeTabMarketplace()).toBeUndefined();
  });

  it("falls back to empty state and the US marketplace when storage holds garbage", async () => {
    sessionGet.mockResolvedValue({ accounts: "garbage" });
    localGet.mockResolvedValue({});
    expect(await readSnapshot()).toEqual({
      accounts: { schemaVersion: 1, byMarketplace: {} },
      throttle: { schemaVersion: 1, byMarketplace: {} },
      prefs: { schemaVersion: 1, selected: "us" },
      expected: { schemaVersion: 1, byMarketplace: {} },
    });
  });

  it("reads the expected accounts from local storage with the other preferences", async () => {
    const expected = {
      schemaVersion: 1,
      byMarketplace: { de: { hash: OTHER_HASH, hint: STORED_HINT } },
    };
    sessionGet.mockResolvedValue({});
    localGet.mockResolvedValue({ expected });
    expect((await readSnapshot()).expected).toEqual(expected);
    expect(localGet).toHaveBeenCalledWith(["prefs", "throttle", "expected"]);
  });

  it("sets one marketplace's expected account and keeps the others", async () => {
    const uk = { hash: ACCOUNT_HASH, hint: "a•••b@example.com" };
    const de = { hash: OTHER_HASH, hint: STORED_HINT };
    localGet.mockResolvedValue({ expected: { schemaVersion: 1, byMarketplace: { uk } } });
    localSet.mockResolvedValue();
    await saveExpected("de", de);
    expect(localSet).toHaveBeenCalledWith({
      expected: { schemaVersion: 1, byMarketplace: { uk, de } },
    });
  });

  it("clears one marketplace's expected account by leaving its key out", async () => {
    const uk = { hash: ACCOUNT_HASH, hint: "a•••b@example.com" };
    const de = { hash: OTHER_HASH, hint: STORED_HINT };
    localGet.mockResolvedValue({ expected: { schemaVersion: 1, byMarketplace: { uk, de } } });
    localSet.mockResolvedValue();
    await saveExpected("de", null);
    expect(localSet).toHaveBeenCalledWith({
      expected: { schemaVersion: 1, byMarketplace: { uk } },
    });
  });

  it("sends a check naming the marketplace and reports whether the worker accepted it", async () => {
    sendMessage.mockResolvedValue({ accepted: true });
    expect(await requestCheck("de", true)).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: "check", marketplace: "de", manual: true });
  });

  it("retries once after 500 ms when the worker is being replaced, then gives up", async () => {
    vi.useFakeTimers();
    sendMessage.mockRejectedValue(new Error("Receiving end does not exist."));
    const result = requestCheck("us", false);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("treats an unexpected reply as not accepted", async () => {
    sendMessage.mockResolvedValue("ok");
    expect(await requestCheck("us", false)).toBe(false);
  });

  it("notifies on session and local changes only and unsubscribes cleanly", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    const handler = addListener.mock.calls[0]?.[0];
    handler?.({}, "session");
    handler?.({}, "sync");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(handler);
  });

  it("turns debug logging on from the stored flag, so the popup logs like the worker", async () => {
    localGet.mockResolvedValue({ debug: true });
    watchDebugLogging();
    expect(localGet).toHaveBeenCalledWith(["debug"]);
    expect(addListener).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(isDebugLogging()).toBe(true);
    });
    setDebugLogging(false);
  });
});
