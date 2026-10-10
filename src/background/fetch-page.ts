import { createClaimScanner } from "@/core/claim-scanner";
import type { ScanResult } from "@/core/claim-scanner";
import type { PageSummary } from "@/core/classify";

export const BODY_CAP_BYTES = 524_288;

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

interface FetchedPage extends PageSummary {
  readonly retryAfter: string | null;
  readonly bytes: number;
}

export type PageFetch =
  | { readonly ok: true; readonly page: FetchedPage }
  | { readonly ok: false; readonly reason: "network" | "timeout" };

interface Drained {
  readonly scan: ScanResult;
  readonly truncated: boolean;
  readonly bytes: number;
}

async function drain(body: ReadableStream<Uint8Array> | null): Promise<Drained> {
  const scanner = createClaimScanner();
  if (body === null) {
    return { scan: scanner.result(), truncated: false, bytes: 0 };
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      scanner.push(decoder.decode());
      return { scan: scanner.result(), truncated: false, bytes };
    }
    bytes += value.byteLength;
    scanner.push(decoder.decode(value, { stream: true }));
    const found = scanner.result().claim !== null;
    if (found || bytes >= BODY_CAP_BYTES) {
      await reader.cancel();
      return { scan: scanner.result(), truncated: !found, bytes };
    }
  }
}

export async function fetchPage(
  url: string,
  fetchFn: FetchFn,
  signal: AbortSignal,
): Promise<PageFetch> {
  try {
    const response = await fetchFn(url, {
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal,
    });
    const { scan, truncated, bytes } = await drain(response.body);
    const retryAfter = response.headers.get("Retry-After");
    return {
      ok: true,
      page: { status: response.status, finalUrl: response.url, retryAfter, scan, truncated, bytes },
    };
  } catch (_err) {
    return { ok: false, reason: signal.aborted ? "timeout" : "network" };
  }
}
