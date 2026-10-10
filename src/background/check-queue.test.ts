import { describe, expect, it, vi } from "vitest";
import type { MarketplaceId } from "@/core/marketplaces";
import { captureDebug } from "@/test/debug-capture";
import { createCheckQueue } from "./check-queue";
import type { RunCheck } from "./checker";
import type { Mock } from "vitest";

interface Gate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

function gate(): Gate {
  let open: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open: () => open?.() };
}

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function gatedRun(): { readonly run: Mock<RunCheck>; readonly gates: Map<MarketplaceId, Gate> } {
  const gates = new Map<MarketplaceId, Gate>();
  const run = vi.fn<RunCheck>((id) => {
    const next = gate();
    gates.set(id, next);
    return next.promise;
  });
  return { run, gates };
}

describe("check queue", () => {
  it("runs one check at a time, so Amazon never gets parallel requests", async () => {
    const { run, gates } = gatedRun();
    const queue = createCheckQueue(run);
    void queue.request({ id: "us", manual: false, priority: "popup" });
    void queue.request({ id: "de", manual: false, priority: "cookie" });
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    gates.get("us")?.open();
    await flush();
    expect(run).toHaveBeenLastCalledWith("de", false);
  });

  it("returns the same promise for a marketplace already running or waiting", async () => {
    const { run, gates } = gatedRun();
    const queue = createCheckQueue(run);
    const first = queue.request({ id: "us", manual: false, priority: "popup" });
    const second = queue.request({ id: "us", manual: true, priority: "popup" });
    expect(second).toBe(first);
    await flush();
    gates.get("us")?.open();
    await first;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("puts a popup request ahead of waiting cookie requests", async () => {
    const { run, gates } = gatedRun();
    const queue = createCheckQueue(run);
    void queue.request({ id: "us", manual: false, priority: "popup" });
    void queue.request({ id: "de", manual: false, priority: "cookie" });
    void queue.request({ id: "fr", manual: false, priority: "popup" });
    await flush();
    gates.get("us")?.open();
    await flush();
    expect(run).toHaveBeenLastCalledWith("fr", false);
  });

  it("drops a waiting popup request when the user switches to another marketplace", async () => {
    const { run, gates } = gatedRun();
    const queue = createCheckQueue(run);
    void queue.request({ id: "us", manual: false, priority: "popup" });
    const abandoned = queue.request({ id: "de", manual: false, priority: "popup" });
    void queue.request({ id: "fr", manual: false, priority: "popup" });
    await abandoned;
    await flush();
    gates.get("us")?.open();
    await flush();
    expect(run.mock.calls.map(([id]) => id)).toEqual(["us", "fr"]);
  });

  it("lets a popup request replace a waiting cookie request for the same marketplace", async () => {
    const { run, gates } = gatedRun();
    const queue = createCheckQueue(run);
    void queue.request({ id: "us", manual: false, priority: "popup" });
    void queue.request({ id: "de", manual: false, priority: "cookie" });
    void queue.request({ id: "de", manual: true, priority: "popup" });
    await flush();
    gates.get("us")?.open();
    await flush();
    expect(run.mock.calls).toEqual([
      ["us", false],
      ["de", true],
    ]);
  });

  it("queues one follow-up when a cookie request arrives for the running marketplace", async () => {
    const { run, gates } = gatedRun();
    const queue = createCheckQueue(run);
    void queue.request({ id: "de", manual: false, priority: "popup" });
    await flush();
    const followUp = queue.request({ id: "de", manual: false, priority: "cookie" });
    const again = queue.request({ id: "de", manual: false, priority: "cookie" });
    expect(again).toBe(followUp);
    gates.get("de")?.open();
    await flush();
    gates.get("de")?.open();
    await followUp;
    expect(run.mock.calls.map(([id]) => id)).toEqual(["de", "de"]);
  });

  it("still dedupes a popup request onto the running marketplace", async () => {
    const { run, gates } = gatedRun();
    const queue = createCheckQueue(run);
    const first = queue.request({ id: "de", manual: false, priority: "cookie" });
    await flush();
    expect(queue.request({ id: "de", manual: true, priority: "popup" })).toBe(first);
    gates.get("de")?.open();
    await first;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps going after a check throws", async () => {
    const run = vi.fn((id: MarketplaceId, _manual: boolean) =>
      id === "us" ? Promise.reject(new Error("boom")) : Promise.resolve(),
    );
    const queue = createCheckQueue(run);
    await Promise.all([
      queue.request({ id: "us", manual: false, priority: "popup" }),
      queue.request({ id: "de", manual: false, priority: "cookie" }),
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("check queue debug lines", () => {
  it("names superseded and deduplicated requests", async () => {
    const capture = captureDebug();
    try {
      const { run, gates } = gatedRun();
      const queue = createCheckQueue(run);
      void queue.request({ id: "us", manual: false, priority: "popup" });
      void queue.request({ id: "de", manual: false, priority: "popup" });
      void queue.request({ id: "fr", manual: true, priority: "popup" });
      void queue.request({ id: "us", manual: false, priority: "popup" });
      await flush();
      gates.get("us")?.open();
      await flush();
      const lines = capture.lines();
      expect(lines).toContain("[account-detector] queue: request fr (popup, manual=true)");
      expect(lines).toContain("[account-detector] queue: superseded de");
      expect(lines).toContain("[account-detector] queue: dedupe us");
      expect(lines).toContain("[account-detector] queue: run fr");
    } finally {
      capture.stop();
    }
  });

  it("reports a cookie job replaced by a popup request", () => {
    const capture = captureDebug();
    try {
      const { run } = gatedRun();
      const queue = createCheckQueue(run);
      void queue.request({ id: "us", manual: false, priority: "popup" });
      void queue.request({ id: "de", manual: false, priority: "cookie" });
      void queue.request({ id: "de", manual: false, priority: "popup" });
      expect(capture.lines()).toContain("[account-detector] queue: replaced cookie job de");
    } finally {
      capture.stop();
    }
  });
});
