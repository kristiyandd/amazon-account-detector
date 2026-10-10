import { describe, expect, it, vi } from "vitest";
import { MARKETPLACES } from "@/core/marketplaces";
import type { CookieChange } from "@/core/session-cookie";
import { buildSigninUrl } from "@/core/signin-url";
import { FakeArea } from "@/test/fake-storage";
import signedInUs from "@/test/fixtures/signed-in-us.html?raw";
import signedOutUs from "@/test/fixtures/signed-out-us.html?raw";
import { createCheckQueue } from "./check-queue";
import { createChecker } from "./checker";
import { createSessionWatcher } from "./session-watcher";
import { createStore } from "./store";
import type { FetchFn } from "./fetch-page";

const login: CookieChange = {
  removed: false,
  cause: "explicit",
  cookie: { name: "at-main", domain: ".amazon.com", storeId: "0" },
};

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function respond(html: string): Response {
  const response = new Response(html, { status: 200 });
  Object.defineProperty(response, "url", { value: buildSigninUrl(MARKETPLACES.us) });
  return response;
}

describe("login during a running check", () => {
  it("is checked again after the debounce and ends signed in with the email", async () => {
    const releases: ((response: Response) => void)[] = [];
    const fetch = vi.fn<FetchFn>(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(resolve);
        }),
    );
    const store = createStore(new FakeArea(), new FakeArea());
    const queue = createCheckQueue(
      createChecker({
        fetch,
        store,
        hasSessionCookie: () => Promise.resolve(true),
        now: () => 1_000_000_000,
        random: () => 0.5,
        timeout: () => new AbortController().signal,
        sleep: () => Promise.resolve(),
        subtle: crypto.subtle,
      }),
    );
    let timer: (() => void) | undefined;
    const watcher = createSessionWatcher({
      store,
      requestCheck: (id) => {
        void queue.request({ id, manual: false, priority: "cookie" });
      },
      now: () => 1_000_000_000,
      setTimer: (callback) => {
        timer = callback;
      },
    });

    void queue.request({ id: "us", manual: false, priority: "popup" });
    await flush();
    await watcher.onChanged(login);
    timer?.();
    await flush();
    releases[0]?.(respond(signedOutUs));
    await flush();
    await flush();
    releases[1]?.(respond(signedInUs));
    await flush();
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await store.readAccount("us")).toMatchObject({
      status: "signedIn",
      email: "test.user@example.com",
    });
  });
});
