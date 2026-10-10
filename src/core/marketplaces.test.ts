import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_IDS,
  MARKETPLACES,
  marketplaceForCookieDomain,
  marketplaceForUrl,
  originOf,
} from "./marketplaces";

describe("marketplaces", () => {
  it("pins the local assoc_handle per market, because usflex breaks four of five (ADR-0005)", () => {
    expect(MARKETPLACE_IDS.map((id) => MARKETPLACES[id].assocHandle)).toEqual([
      "usflex",
      "gbflex",
      "deflex",
      "itflex",
      "frflex",
    ]);
  });

  it("gives each market the short code the popup tile and the toolbar badge show", () => {
    expect(MARKETPLACE_IDS.map((id) => MARKETPLACES[id].code)).toEqual([
      "US",
      "UK",
      "DE",
      "IT",
      "FR",
    ]);
  });

  it("builds the www origin that the fetch and the CSP use", () => {
    expect(originOf(MARKETPLACES.uk)).toBe("https://www.amazon.co.uk");
  });

  it("maps a session cookie's domain to its marketplace with or without the leading dot", () => {
    expect(marketplaceForCookieDomain(".amazon.com")).toBe("us");
    expect(marketplaceForCookieDomain("www.amazon.de")).toBe("de");
    expect(marketplaceForCookieDomain(".amazon.co.uk")).toBe("uk");
  });

  it("ignores look-alike domains so another site's cookie never changes the state", () => {
    expect(marketplaceForCookieDomain(".amazon.com.au")).toBeUndefined();
    expect(marketplaceForCookieDomain(".notamazon.com")).toBeUndefined();
  });

  it("finds the marketplace of an Amazon tab so the popup opens where the user is shopping", () => {
    expect(marketplaceForUrl("https://www.amazon.de/gp/cart/view.html")).toBe("de");
    expect(marketplaceForUrl("https://smile.amazon.co.uk/")).toBe("uk");
    expect(marketplaceForUrl("https://amazon.com/")).toBe("us");
  });

  it("ignores other sites, look-alikes, plain http and missing or broken URLs", () => {
    expect(marketplaceForUrl("https://www.amazon.com.au/")).toBeUndefined();
    expect(marketplaceForUrl("https://www.notamazon.com/")).toBeUndefined();
    expect(marketplaceForUrl("https://www.amazon.de.example.com/")).toBeUndefined();
    expect(marketplaceForUrl("http://www.amazon.de/")).toBeUndefined();
    expect(marketplaceForUrl("chrome://extensions/")).toBeUndefined();
    expect(marketplaceForUrl("not a url")).toBeUndefined();
    expect(marketplaceForUrl(undefined)).toBeUndefined();
  });
});
