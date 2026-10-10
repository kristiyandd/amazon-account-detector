import { describe, expect, it, vi } from "vitest";
import { MARKETPLACES } from "@/core/marketplaces";
import type { CookieIdentity } from "@/core/session-cookie";
import { hasSessionCookie } from "./cookies";
import type { CookieReader } from "./cookies";
import type { Mock } from "vitest";

function readerWith(cookies: CookieIdentity[]): { readonly getAll: Mock<CookieReader["getAll"]> } {
  return { getAll: vi.fn<CookieReader["getAll"]>(() => Promise.resolve(cookies)) };
}

describe("hasSessionCookie", () => {
  it("asks the default cookie store for the marketplace's own URL", async () => {
    const reader = readerWith([{ name: "at-main", domain: ".amazon.com", storeId: "0" }]);
    expect(await hasSessionCookie(reader, MARKETPLACES.us)).toBe(true);
    expect(reader.getAll).toHaveBeenCalledWith({ url: "https://www.amazon.com/", storeId: "0" });
  });

  it("ignores cookies that do not prove a session", async () => {
    const reader = readerWith([
      { name: "sst-main", domain: ".amazon.com", storeId: "0" },
      { name: "at-main", domain: ".amazon.com", storeId: "0", partitionKey: {} },
    ]);
    expect(await hasSessionCookie(reader, MARKETPLACES.us)).toBe(false);
  });
});
