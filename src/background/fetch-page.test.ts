import { describe, expect, it, vi } from "vitest";
import { BODY_CAP_BYTES, fetchPage } from "./fetch-page";

const URL_ = "https://www.amazon.com/ap/signin?x=1";
const encoder = new TextEncoder();

function streamOf(
  chunks: readonly Uint8Array[],
  served: { count: number },
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull(controller): void {
      const chunk = chunks[served.count];
      served.count += 1;
      if (chunk === undefined) {
        controller.close();
      } else {
        controller.enqueue(chunk);
      }
    },
  });
}

function responseOf(body: ReadableStream<Uint8Array> | null, status = 200): Response {
  const response = new Response(body, { status, headers: { "Retry-After": "120" } });
  Object.defineProperty(response, "url", { value: URL_ });
  return response;
}

describe("fetchPage", () => {
  it("sends the session cookies, bypasses the cache and sends no referrer", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(responseOf(null, 202)));
    const signal = new AbortController().signal;
    const result = await fetchPage(URL_, fetchFn, signal);
    expect(result.ok && result.page.bytes).toBe(0);
    expect(fetchFn).toHaveBeenCalledWith(URL_, {
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal,
    });
  });

  it("stops reading as soon as the claim is found", async () => {
    const served = { count: 0 };
    const chunks = [
      "<p>head</p>",
      '<input id="ap-claim" value="test.user@example.com">',
      "a".repeat(9000),
      "b",
      "c",
      "d",
    ].map((text) => encoder.encode(text));
    const result = await fetchPage(
      URL_,
      () => Promise.resolve(responseOf(streamOf(chunks, served))),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      ok: true,
      page: { status: 200, finalUrl: URL_, retryAfter: "120", truncated: false },
    });
    expect(result.ok && result.page.scan.claim).toBe("test.user@example.com");
    expect(served.count).toBeLessThan(chunks.length);
  });

  it("stops at the 512 KiB cap and reports the page as truncated", async () => {
    const served = { count: 0 };
    const chunks = Array.from({ length: 12 }, () => encoder.encode("x".repeat(65_536)));
    const result = await fetchPage(
      URL_,
      () => Promise.resolve(responseOf(streamOf(chunks, served))),
      new AbortController().signal,
    );
    expect(result.ok && result.page.truncated).toBe(true);
    expect(result.ok && result.page.bytes).toBeGreaterThanOrEqual(BODY_CAP_BYTES);
    expect(served.count * 65_536).toBeLessThanOrEqual(BODY_CAP_BYTES + 2 * 65_536);
  });

  it("keeps a multi-byte character intact when a chunk boundary splits it", async () => {
    const bytes = encoder.encode('<input id="ap-claim" value="jörg@example.com">');
    const split = bytes.indexOf(0xc3) + 1;
    const served = { count: 0 };
    const result = await fetchPage(
      URL_,
      () =>
        Promise.resolve(responseOf(streamOf([bytes.slice(0, split), bytes.slice(split)], served))),
      new AbortController().signal,
    );
    expect(result.ok && result.page.scan.claim).toBe("jörg@example.com");
  });

  it("handles an empty 202 body, which Amazon sends as a challenge", async () => {
    const result = await fetchPage(
      URL_,
      () => Promise.resolve(responseOf(null, 202)),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      ok: true,
      page: { status: 202, scan: { claim: null }, truncated: false },
    });
  });

  it("reports a network failure and a timeout as different reasons", async () => {
    const offline = await fetchPage(
      URL_,
      () => Promise.reject(new TypeError("Failed to fetch")),
      new AbortController().signal,
    );
    expect(offline).toEqual({ ok: false, reason: "network" });
    const aborted = AbortSignal.abort(new DOMException("slow", "TimeoutError"));
    const slow = await fetchPage(
      URL_,
      () => Promise.reject(new DOMException("slow", "TimeoutError")),
      aborted,
    );
    expect(slow).toEqual({ ok: false, reason: "timeout" });
  });
});
