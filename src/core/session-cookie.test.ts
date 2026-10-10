import { describe, expect, it } from "vitest";
import { toCookieSignal } from "./session-cookie";
import type { CookieChange } from "./session-cookie";

function removal(name: string, cause: string, domain = ".amazon.com"): CookieChange {
  return { removed: true, cause, cookie: { name, domain, storeId: "0" } };
}

function write(name: string, domain = ".amazon.com"): CookieChange {
  return { removed: false, cause: "explicit", cookie: { name, domain, storeId: "0" } };
}

describe("toCookieSignal", () => {
  it("reports a logout when at-main is removed by Amazon", () => {
    expect(toCookieSignal(removal("at-main", "expired_overwrite"))).toEqual({
      kind: "signedOut",
      marketplace: "us",
    });
  });

  it("reports a logout when the user clears cookies or the cookie expires", () => {
    expect(toCookieSignal(removal("at-main", "explicit"))).toEqual({
      kind: "signedOut",
      marketplace: "us",
    });
    expect(toCookieSignal(removal("at-acbde", "expired", ".amazon.de"))).toEqual({
      kind: "signedOut",
      marketplace: "de",
    });
  });

  it("ignores the removal half of an overwrite, because the new cookie follows at once", () => {
    expect(toCookieSignal(removal("at-main", "overwrite"))).toEqual({ kind: "ignore" });
  });

  it("reports a login when the session cookie is written", () => {
    expect(toCookieSignal(write("at-acbuk", ".amazon.co.uk"))).toEqual({
      kind: "signedIn",
      marketplace: "uk",
    });
  });

  it("ignores the cookies that churn on every page view or survive logout", () => {
    for (const name of ["sst-main", "session-token", "x-main", "__Secure-id_dbp", "sess-at-main"]) {
      expect(toCookieSignal(removal(name, "expired_overwrite"))).toEqual({ kind: "ignore" });
    }
  });

  it("ignores other domains, other cookie stores and partitioned cookies", () => {
    expect(toCookieSignal(removal("at-main", "explicit", ".amazon.com.au"))).toEqual({
      kind: "ignore",
    });
    expect(
      toCookieSignal({
        removed: true,
        cause: "explicit",
        cookie: { name: "at-main", domain: ".amazon.com", storeId: "1" },
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      toCookieSignal({
        removed: true,
        cause: "explicit",
        cookie: { name: "at-main", domain: ".amazon.com", storeId: "0", partitionKey: {} },
      }),
    ).toEqual({ kind: "ignore" });
  });
});
