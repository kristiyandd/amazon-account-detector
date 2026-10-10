import { describe, expect, it } from "vitest";
import type { AccountState } from "@/core/state";
import { FakeArea } from "@/test/fake-storage";
import { createStore } from "./store";

const signedOut: AccountState = { status: "signedOut", checkedAt: 1, generation: 0 };

describe("store", () => {
  it("reads nothing from empty or corrupt storage instead of throwing", async () => {
    const store = createStore(new FakeArea({ accounts: "garbage" }), new FakeArea());
    expect(await store.readAccount("us")).toBeUndefined();
    expect(await store.readThrottle("us")).toBeUndefined();
  });

  it("writes a changed state and skips an identical one, so onChanged does not fire for nothing", async () => {
    const session = new FakeArea();
    const store = createStore(session, new FakeArea());
    await store.updateAccount("us", () => signedOut);
    await store.updateAccount("us", () => ({ ...signedOut }));
    expect(session.sets).toBe(1);
    expect(await store.readAccount("us")).toEqual(signedOut);
  });

  it("reports whether an update actually wrote", async () => {
    const store = createStore(new FakeArea(), new FakeArea());
    expect(await store.updateAccount("us", () => signedOut)).toBe(true);
    expect(await store.updateAccount("us", () => ({ ...signedOut }))).toBe(false);
    expect(await store.updateAccount("us", () => null)).toBe(false);
    expect(await store.updateThrottle("us", () => ({ failures: 1, nextAllowedAt: 5 }))).toBe(true);
    expect(await store.updateThrottle("us", () => ({ failures: 1, nextAllowedAt: 5 }))).toBe(false);
  });

  it("leaves the state alone when the update returns null", async () => {
    const session = new FakeArea();
    const store = createStore(session, new FakeArea());
    await store.updateAccount("us", () => null);
    expect(session.sets).toBe(0);
  });

  it("never loses an update when two marketplaces are written at the same time", async () => {
    const store = createStore(new FakeArea(), new FakeArea());
    await Promise.all([
      store.updateAccount("us", () => signedOut),
      store.updateAccount("de", () => signedOut),
    ]);
    expect(await store.readAccount("us")).toEqual(signedOut);
    expect(await store.readAccount("de")).toEqual(signedOut);
  });

  it("keeps working after one update throws", async () => {
    const store = createStore(new FakeArea(), new FakeArea());
    const failing = store.updateAccount("us", () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");
    await store.updateAccount("us", () => signedOut);
    expect(await store.readAccount("us")).toEqual(signedOut);
  });

  it("stores the throttle in the local area and skips a no-op reset", async () => {
    const local = new FakeArea();
    const store = createStore(new FakeArea(), local);
    await store.updateThrottle("uk", () => ({ failures: 0, nextAllowedAt: 0 }));
    expect(local.sets).toBe(0);
    await store.updateThrottle("uk", () => ({ failures: 1, nextAllowedAt: 5 }));
    expect(await store.readThrottle("uk")).toEqual({ failures: 1, nextAllowedAt: 5 });
  });

  it("writes a throttle entry whose only change is the time of the last manual check", async () => {
    const local = new FakeArea();
    const store = createStore(new FakeArea(), local);
    await store.updateThrottle("uk", () => ({ failures: 0, nextAllowedAt: 0, lastManualAt: 7 }));
    expect(local.sets).toBe(1);
    expect(await store.readThrottle("uk")).toEqual({
      failures: 0,
      nextAllowedAt: 0,
      lastManualAt: 7,
    });
  });
});
