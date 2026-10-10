import { describe, expect, it, vi } from "vitest";
import { parseEmail } from "@/core/email";
import { hashEmail } from "@/core/expected";
import { MARKETPLACES } from "@/core/marketplaces";
import { signedOutByCookie } from "@/core/reduce";
import { buildSigninUrl } from "@/core/signin-url";
import { captureDebug } from "@/test/debug-capture";
import { FakeArea } from "@/test/fake-storage";
import signedInUs from "@/test/fixtures/signed-in-us.html?raw";
import signedOutUs from "@/test/fixtures/signed-out-us.html?raw";
import { createChecker } from "./checker";
import { createStore } from "./store";
import type { CheckDeps, RunCheck } from "./checker";
import type { FetchFn } from "./fetch-page";
import type { Store } from "./store";
import type { Mock } from "vitest";

const NOW = 1_000_000_000;
type Reply = () => Promise<Response>;

interface Harness {
  readonly run: RunCheck;
  readonly fetch: Mock<FetchFn>;
  readonly sleep: Mock<(ms: number) => Promise<void>>;
  readonly store: Store;
}

function page(html: string, status = 200, headers: Record<string, string> = {}): Reply {
  return () => {
    const response = new Response(html, { status, headers });
    Object.defineProperty(response, "url", { value: buildSigninUrl(MARKETPLACES.us) });
    return Promise.resolve(response);
  };
}

const offline: Reply = () => Promise.reject(new TypeError("Failed to fetch"));

function setup(replies: readonly Reply[], overrides: Partial<CheckDeps> = {}): Harness {
  let calls = 0;
  const fetch = vi.fn<FetchFn>((_url, init) => {
    const reply = replies[Math.min(calls, replies.length - 1)] ?? offline;
    calls += 1;
    return init.signal?.aborted === true
      ? Promise.reject(new DOMException("aborted", "TimeoutError"))
      : reply();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
  const deps: CheckDeps = {
    fetch,
    store: createStore(new FakeArea(), new FakeArea()),
    hasSessionCookie: () => Promise.resolve(true),
    now: () => NOW,
    random: () => 0.5,
    timeout: () => new AbortController().signal,
    sleep,
    subtle: crypto.subtle,
    ...overrides,
  };
  return { run: createChecker(deps), fetch, sleep, store: deps.store };
}

describe("checker", () => {
  it("stores the email and its hash when the page and the session cookie agree", async () => {
    const { run, store } = setup([page(signedInUs)]);
    await run("us", false);
    expect(await store.readAccount("us")).toEqual({
      status: "signedIn",
      email: "test.user@example.com",
      emailHash: await hashEmail("test.user@example.com", crypto.subtle),
      checkedAt: NOW,
      generation: 0,
    });
  });

  it("still stores the email when hashing fails, so the match is unknown rather than wrong", async () => {
    const { run, store } = setup([page(signedInUs)], {
      subtle: { digest: () => Promise.reject(new Error("no crypto")) },
    });
    await run("us", false);
    const state = await store.readAccount("us");
    expect(state?.email).toBe("test.user@example.com");
    expect(state).not.toHaveProperty("emailHash");
  });

  it("fetches the marketplace's own sign-in URL", async () => {
    const { run, fetch } = setup([page(signedOutUs)], {
      hasSessionCookie: () => Promise.resolve(false),
    });
    await run("de", false);
    expect(fetch.mock.calls[0]?.[0]).toBe(buildSigninUrl(MARKETPLACES.de));
  });

  it("drops a cached email when the page and the cookie disagree, without claiming 'signed out'", async () => {
    const email = parseEmail("test.user@example.com");
    const store = createStore(new FakeArea(), new FakeArea());
    if (email !== null) {
      await store.updateAccount("us", () => ({
        status: "signedIn",
        email,
        checkedAt: 1,
        generation: 0,
      }));
    }
    const { run } = setup([page(signedOutUs)], { store });
    await run("us", false);
    expect(await store.readAccount("us")).toEqual({
      status: "unknown",
      generation: 0,
      lastError: { reason: "sessionMismatch", at: NOW },
    });
  });

  it("treats a failing cookie lookup as an unconfirmed session instead of crashing", async () => {
    const { run, store } = setup([page(signedInUs)], {
      hasSessionCookie: () => Promise.reject(new Error("cookies API unavailable")),
    });
    await run("us", false);
    expect((await store.readAccount("us"))?.lastError?.reason).toBe("sessionMismatch");
  });

  it("survives a corrupt stored throttle by treating it as empty", async () => {
    const local = new FakeArea({
      throttle: { schemaVersion: 1, byMarketplace: { us: { failures: 1, nextAllowedAt: 1e20 } } },
    });
    const { run, store } = setup([offline], { store: createStore(new FakeArea(), local) });
    await expect(run("us", false)).resolves.toBeUndefined();
    expect((await store.readAccount("us"))?.lastError?.reason).toBe("network");
  });

  it("retries a network failure twice with jittered waits, then keeps the old result as stale", async () => {
    const { run, fetch, sleep, store } = setup([offline]);
    await run("us", false);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
    expect((await store.readAccount("us"))?.lastError?.reason).toBe("network");
  });

  it("recovers when a retry after a server error succeeds", async () => {
    const { run, store } = setup([page("", 500), page(signedInUs)]);
    await run("us", false);
    expect((await store.readAccount("us"))?.status).toBe("signedIn");
  });

  it("does not start another attempt once the 25 s deadline has passed", async () => {
    const deadline = new AbortController();
    const { run, fetch, store } = setup(
      [
        () => {
          deadline.abort(new DOMException("deadline", "TimeoutError"));
          return Promise.reject(new TypeError("Failed to fetch"));
        },
      ],
      { timeout: (ms) => (ms === 25_000 ? deadline.signal : new AbortController().signal) },
    );
    await run("us", false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await store.readAccount("us"))?.lastError?.reason).toBe("timeout");
  });

  it("never retries a challenge and skips automatic checks until the backoff ends", async () => {
    const { run, fetch, store } = setup([page("", 202)]);
    await run("us", false);
    await run("us", false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await store.readThrottle("us")).toEqual({ failures: 1, nextAllowedAt: NOW + 1_350_000 });
  });

  it("lets a manual check through the backoff, because the user asked for it", async () => {
    const { run, fetch } = setup([page("", 202)]);
    await run("us", false);
    await run("us", true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("records each manual check and refuses another one on that marketplace for 30 s", async () => {
    const clock = { now: NOW };
    const { run, fetch, store } = setup([page(signedOutUs)], {
      now: () => clock.now,
      hasSessionCookie: () => Promise.resolve(false),
    });
    await run("us", true);
    expect((await store.readThrottle("us"))?.lastManualAt).toBe(NOW);
    clock.now += 29_000;
    await run("us", true);
    await run("de", true);
    expect(fetch).toHaveBeenCalledTimes(2);
    clock.now += 1000;
    await run("us", true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await store.readThrottle("us"))?.lastManualAt).toBe(NOW + 30_000);
  });

  it("honours Retry-After on a 429", async () => {
    const { run, store } = setup([page("", 429, { "Retry-After": "7200" })]);
    await run("us", false);
    expect((await store.readThrottle("us"))?.nextAllowedAt).toBe(NOW + 7_200_000);
  });

  it("drops its result when a logout bumped the generation during the check", async () => {
    const store = createStore(new FakeArea(), new FakeArea());
    const { run } = setup(
      [
        async () => {
          await store.updateAccount("us", (previous) => signedOutByCookie(previous, NOW));
          return page(signedInUs)();
        },
      ],
      { store },
    );
    await run("us", false);
    expect(await store.readAccount("us")).toEqual({
      status: "signedOut",
      checkedAt: NOW,
      generation: 1,
    });
  });
});

describe("checker debug lines", () => {
  it("traces a signed-in check step by step without ever printing the full email", async () => {
    const capture = captureDebug();
    try {
      const { run } = setup([page(signedInUs)]);
      await run("us", false);
      const lines = capture.lines();
      expect(lines.some((line) => /check us: attempt 1 → 200 \d+ 0 ms/u.test(line))).toBe(true);
      expect(lines).toContain("[account-detector] check us: classified signedIn");
      expect(lines).toContain("[account-detector] check us: cookie present=true → signedIn");
      expect(lines).toContain("[account-detector] check us: wrote signedIn");
      expect(lines.some((line) => line.includes("test.user@"))).toBe(false);
    } finally {
      capture.stop();
    }
  });

  it("reports an unchanged result instead of claiming a write, and stays quiet about a steady throttle", async () => {
    const capture = captureDebug();
    try {
      const { run } = setup([page(signedInUs)]);
      await run("us", false);
      await run("us", false);
      const lines = capture.lines();
      expect(lines.filter((line) => line.endsWith("check us: wrote signedIn"))).toHaveLength(1);
      expect(lines).toContain("[account-detector] check us: unchanged");
      expect(lines.some((line) => line.includes("throttle"))).toBe(false);
    } finally {
      capture.stop();
    }
  });

  it("logs the throttle only when a challenge changed it", async () => {
    const capture = captureDebug();
    try {
      const { run } = setup([page("", 202)]);
      await run("us", false);
      expect(
        capture.lines().some((line) => line.includes("check us: throttle failures=1 next=")),
      ).toBe(true);
    } finally {
      capture.stop();
    }
  });

  it("says why an automatic check was skipped while a backoff is running", async () => {
    const capture = captureDebug();
    try {
      const { run } = setup([page("", 202)]);
      await run("us", false);
      await run("us", false);
      expect(
        capture.lines().some((line) => line.includes("check us: skipped (throttled until ")),
      ).toBe(true);
    } finally {
      capture.stop();
    }
  });

  it("logs the wait before each retry of a network failure", async () => {
    const capture = captureDebug();
    try {
      const { run } = setup([offline]);
      await run("us", false);
      expect(capture.lines()).toContain("[account-detector] check us: retry 1 in 500 ms");
    } finally {
      capture.stop();
    }
  });
});
