import fc from "fast-check";
import { describe, expect, it } from "vitest";
import notFoundDe from "@/test/fixtures/not-found-de.html?raw";
import signedInUs from "@/test/fixtures/signed-in-us.html?raw";
import signedOutDe from "@/test/fixtures/signed-out-de.html?raw";
import signedOutFr from "@/test/fixtures/signed-out-fr.html?raw";
import signedOutIt from "@/test/fixtures/signed-out-it.html?raw";
import signedOutUk from "@/test/fixtures/signed-out-uk.html?raw";
import signedOutUs from "@/test/fixtures/signed-out-us.html?raw";
import wafChallengeUk from "@/test/fixtures/waf-challenge-uk.html?raw";
import { scanAll } from "./claim-scanner";
import { classifyPage, crossCheck } from "./classify";
import { MARKETPLACES } from "./marketplaces";
import { buildSigninUrl } from "./signin-url";
import type { MarketplaceId } from "./marketplaces";
import type { Outcome } from "./state";

function classify(html: string, id: MarketplaceId, status = 200): Outcome {
  const page = {
    status,
    finalUrl: buildSigninUrl(MARKETPLACES[id]),
    scan: scanAll([html]),
    truncated: false,
  };
  return classifyPage(page, MARKETPLACES[id]);
}

describe("classifyPage on recorded pages", () => {
  it("reads the email from the real signed-in page, even if its scripts mention captchas", () => {
    expect(classify(signedInUs, "us")).toEqual({
      kind: "signedIn",
      email: "test.user@example.com",
    });
  });

  it.each([
    [signedOutUs, "us"],
    [signedOutDe, "de"],
    [signedOutIt, "it"],
    [signedOutUk, "uk"],
    [signedOutFr, "fr"],
  ] as const)("recognises the signed-out page in every language (%#)", (html, id) => {
    expect(classify(html, id)).toEqual({ kind: "signedOut" });
  });

  it("treats the WAF page and a 202 with an empty body as a challenge, never as signed out", () => {
    expect(classify(wafChallengeUk, "uk", 202)).toEqual({ kind: "failed", reason: "challenge" });
    expect(classify(wafChallengeUk, "uk", 200)).toEqual({ kind: "failed", reason: "challenge" });
    expect(classify("", "fr", 202)).toEqual({ kind: "failed", reason: "challenge" });
  });

  it("treats a 404 page as unreadable rather than signed out", () => {
    expect(classify(notFoundDe, "de", 404)).toEqual({ kind: "failed", reason: "parse" });
  });
});

describe("classifyPage on status codes and edge cases", () => {
  it.each([
    [429, "rateLimited"],
    [503, "challenge"],
    [500, "server"],
    [502, "server"],
  ] as const)("maps status %i to %s", (status, reason) => {
    expect(classify(signedOutUs, "us", status)).toEqual({ kind: "failed", reason });
  });

  it("refuses an answer from another host after a redirect", () => {
    const page = {
      status: 200,
      finalUrl: "https://www.amazon.de/ap/signin",
      scan: scanAll([signedOutUs]),
      truncated: false,
    };
    expect(classifyPage(page, MARKETPLACES.us)).toEqual({ kind: "failed", reason: "parse" });
  });

  it("reports signed in without an email when the claim holds a phone number or a masked value", () => {
    expect(classify('<input id="ap-claim" value="+359888123456">', "us")).toEqual({
      kind: "signedIn",
      email: null,
    });
    expect(classify('<input id="ap-claim" value="t***@example.com">', "us")).toEqual({
      kind: "signedIn",
      email: null,
    });
  });

  it("never throws and never reports signed in for a page without the claim", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 100, max: 599 }), (html, status) => {
        fc.pre(!html.includes("ap-claim"));
        expect(classify(html, "us", status).kind).not.toBe("signedIn");
      }),
    );
  });

  it("treats an empty 200 and a truncated sign-in page as unreadable", () => {
    expect(classify("", "us")).toEqual({ kind: "failed", reason: "parse" });
    const page = {
      status: 200,
      finalUrl: buildSigninUrl(MARKETPLACES.us),
      scan: scanAll([signedOutUs]),
      truncated: true,
    };
    expect(classifyPage(page, MARKETPLACES.us)).toEqual({ kind: "failed", reason: "parse" });
  });
});

describe("crossCheck", () => {
  const signedIn: Outcome = { kind: "signedIn", email: null };
  const mismatch: Outcome = { kind: "failed", reason: "sessionMismatch" };

  it("keeps the page's answer when the session cookie agrees", () => {
    expect(crossCheck(signedIn, true)).toBe(signedIn);
    expect(crossCheck({ kind: "signedOut" }, false)).toEqual({ kind: "signedOut" });
  });

  it("reports a mismatch when the page and the cookie disagree, in either direction", () => {
    expect(crossCheck({ kind: "signedOut" }, true)).toEqual(mismatch);
    expect(crossCheck(signedIn, false)).toEqual(mismatch);
  });

  it("passes failures through untouched", () => {
    expect(crossCheck({ kind: "failed", reason: "timeout" }, true)).toEqual({
      kind: "failed",
      reason: "timeout",
    });
  });
});
