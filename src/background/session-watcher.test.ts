import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceId } from "@/core/marketplaces";
import type { CookieChange } from "@/core/session-cookie";
import { TEST_EMAIL } from "@/test/data";
import { captureDebug } from "@/test/debug-capture";
import { FakeArea } from "@/test/fake-storage";
import { createSessionWatcher } from "./session-watcher";
import { createStore } from "./store";
import type { SessionWatcher } from "./session-watcher";
import type { Store } from "./store";
import type { Mock } from "vitest";

const NOW = 1_000_000;
const login: CookieChange = {
  removed: false,
  cause: "explicit",
  cookie: { name: "at-main", domain: ".amazon.com", storeId: "0" },
};
const logout: CookieChange = {
  removed: true,
  cause: "expired_overwrite",
  cookie: { name: "at-main", domain: ".amazon.com", storeId: "0" },
};

const WORKER_IDLE_STOP_MS = 30_000;
const LONGEST_SAFE_TIMER_MS = 25_000;

interface WatcherHarness {
  readonly watcher: SessionWatcher;
  readonly store: Store;
  readonly requestCheck: Mock<(id: MarketplaceId) => void>;
  readonly clock: { now: number };
  readonly fireTimers: () => void;
  readonly delays: () => readonly number[];
}

interface Timer {
  readonly callback: () => void;
  readonly at: number;
}

function setup(): WatcherHarness {
  let timers: readonly Timer[] = [];
  let delays: readonly number[] = [];
  const clock = { now: NOW };
  const requestCheck = vi.fn<(id: MarketplaceId) => void>();
  const store = createStore(new FakeArea(), new FakeArea());
  const watcher = createSessionWatcher({
    store,
    requestCheck,
    now: () => clock.now,
    setTimer: (callback, ms) => {
      delays = [...delays, ms];
      timers = [...timers, { callback, at: clock.now + ms }];
    },
  });
  const fireTimers = (): void => {
    const due = timers.toSorted((a, b) => a.at - b.at);
    timers = [];
    for (const timer of due) {
      clock.now = Math.max(clock.now, timer.at);
      timer.callback();
    }
  };
  return { watcher, store, requestCheck, clock, fireTimers, delays: () => delays };
}

describe("session watcher", () => {
  it("marks the marketplace signed out on logout without asking Amazon", async () => {
    const { watcher, store, requestCheck } = setup();
    await watcher.onChanged(logout);
    expect(await store.readAccount("us")).toEqual({
      status: "signedOut",
      checkedAt: NOW,
      generation: 1,
    });
    expect(requestCheck).not.toHaveBeenCalled();
  });

  it("forgets the old email at once when the session cookie is rewritten (login or account switch)", async () => {
    const { watcher, store } = setup();
    await store.updateAccount("us", () => ({
      status: "signedIn",
      email: TEST_EMAIL,
      checkedAt: NOW,
      generation: 0,
    }));
    await watcher.onChanged(login);
    expect(await store.readAccount("us")).toEqual({ status: "unknown", generation: 1 });
  });

  it("turns a burst of login events into one check after the debounce", async () => {
    const { watcher, requestCheck, fireTimers } = setup();
    await watcher.onChanged(login);
    await watcher.onChanged(login);
    await watcher.onChanged(login);
    expect(requestCheck).not.toHaveBeenCalled();
    fireTimers();
    expect(requestCheck).toHaveBeenCalledExactlyOnceWith("us");
  });

  it("defers a login inside the 20-second window to one check when the window ends, so the account is never left unknown", async () => {
    const { watcher, requestCheck, clock, fireTimers } = setup();
    await watcher.onChanged(login);
    fireTimers();
    expect(clock.now).toBe(NOW + 500);
    clock.now = NOW + 10_000;
    await watcher.onChanged(login);
    await watcher.onChanged(login);
    expect(requestCheck).toHaveBeenCalledTimes(1);
    fireTimers();
    expect(requestCheck).toHaveBeenCalledTimes(2);
    expect(clock.now).toBe(NOW + 20_500);
  });

  it("never schedules a timer longer than 25 seconds, so it fires before the idle worker is stopped", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 40_000 }), { minLength: 1, maxLength: 12 }),
        async (gaps) => {
          const { watcher, clock, fireTimers, delays } = setup();
          for (const gap of gaps) {
            clock.now += gap;
            await watcher.onChanged(login);
            if (gap % 2 === 0) {
              fireTimers();
            }
          }
          expect(delays().every((delay) => delay < LONGEST_SAFE_TIMER_MS)).toBe(true);
          expect(LONGEST_SAFE_TIMER_MS).toBeLessThan(WORKER_IDLE_STOP_MS);
        },
      ),
    );
  });

  it("keeps cookie-triggered checks of one marketplace at least 20 seconds apart", async () => {
    const { watcher, requestCheck, clock, fireTimers } = setup();
    let times: readonly number[] = [];
    requestCheck.mockImplementation(() => {
      times = [...times, clock.now];
    });
    for (let step = 0; step < 6; step += 1) {
      clock.now += 5_000;
      await watcher.onChanged(login);
      fireTimers();
    }
    const gaps = times.slice(1).map((time, index) => time - (times[index] ?? 0));
    expect(times.length).toBe(6);
    expect(gaps.every((gap) => gap >= 20_000)).toBe(true);
  });

  it("does nothing for cookies that are not the session cookie", async () => {
    const { watcher, store, requestCheck, fireTimers } = setup();
    await watcher.onChanged({ ...logout, cookie: { ...logout.cookie, name: "sst-main" } });
    await watcher.onChanged({ ...logout, cause: "overwrite" });
    fireTimers();
    expect(await store.readAccount("us")).toBeUndefined();
    expect(requestCheck).not.toHaveBeenCalled();
  });
});

describe("session watcher debug lines", () => {
  it("traces a cookie write as forget plus a scheduled check, and a removal as signed out", async () => {
    const capture = captureDebug();
    try {
      const { watcher } = setup();
      await watcher.onChanged(login);
      await watcher.onChanged(logout);
      const lines = capture.lines();
      expect(lines).toContain("[account-detector] cookie at-main written (explicit) → forget us");
      expect(lines).toContain("[account-detector] cookie: check us scheduled in 500 ms");
      expect(lines).toContain(
        "[account-detector] cookie at-main removed (expired_overwrite) → signedOut us",
      );
    } finally {
      capture.stop();
    }
  });

  it("stays silent about cookies that are not a login signal", async () => {
    const capture = captureDebug();
    try {
      const { watcher, fireTimers } = setup();
      await watcher.onChanged({ ...logout, cause: "overwrite" });
      await watcher.onChanged(login);
      fireTimers();
      await watcher.onChanged(login);
      const lines = capture.lines();
      expect(lines.some((line) => line.includes("→ ignore"))).toBe(false);
      expect(lines).toContain("[account-detector] cookie: check us scheduled in 20000 ms");
    } finally {
      capture.stop();
    }
  });
});
