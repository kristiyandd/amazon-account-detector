import { describe, expect, it } from "vitest";
import { TEST_EMAIL, TEST_EMAIL_TEXT } from "@/test/data";
import { MARKETPLACES } from "./marketplaces";
import { buildSigninUrl } from "./signin-url";
import { describeStatus } from "./view";
import type { AccountState } from "./state";
import type { ViewInput } from "./view";

const NOW = 10_000_000;
const signedIn: AccountState = {
  status: "signedIn",
  email: TEST_EMAIL,
  checkedAt: NOW - 120_000,
  generation: 0,
};

function input(overrides: Partial<ViewInput>): ViewInput {
  return {
    state: undefined,
    throttle: undefined,
    marketplace: MARKETPLACES.de,
    checking: false,
    startFailed: false,
    now: NOW,
    formatClock: () => "14:30",
    ...overrides,
  };
}

describe("describeStatus", () => {
  it("shows the email and how fresh it is", () => {
    expect(describeStatus(input({ state: signedIn }))).toEqual({
      headline: "Signed in",
      email: TEST_EMAIL_TEXT,
      detail: "Checked 2 min ago, at 14:30",
      pill: { text: "Signed in", tone: "in" },
      staleWarning: null,
      link: null,
    });
  });

  it("labels a successful result older than 24 h 'Last known' and warns it may be out of date", () => {
    const old: AccountState = { ...signedIn, checkedAt: NOW - 172_800_000 };
    expect(describeStatus(input({ state: old }))).toMatchObject({
      email: TEST_EMAIL_TEXT,
      pill: { text: "Last known", tone: "warn" },
      staleWarning: "Checked 2 d ago. This may be out of date; press Check now.",
    });
  });

  it("offers a link to the marketplace whenever the verification advice is shown", () => {
    const challenge: AccountState = { ...signedIn, lastError: { reason: "challenge", at: NOW } };
    const link = { text: "Open Amazon.de", href: "https://www.amazon.de/" };
    expect(describeStatus(input({ state: challenge })).link).toEqual(link);
    expect(
      describeStatus(input({ throttle: { failures: 1, nextAllowedAt: NOW + 60_000 } })).link,
    ).toEqual(link);
  });

  it("offers no link while checking or for a rate limit, where a visit does not help", () => {
    const challenge: AccountState = { ...signedIn, lastError: { reason: "challenge", at: NOW } };
    const limited: AccountState = { ...signedIn, lastError: { reason: "rateLimited", at: NOW } };
    expect(describeStatus(input({ state: challenge, checking: true })).link).toBeNull();
    expect(describeStatus(input({ state: limited })).link).toBeNull();
  });

  it("keeps the green pill for a result written a moment ahead of the popup clock", () => {
    const ahead: AccountState = { ...signedIn, checkedAt: NOW + 2000 };
    expect(describeStatus(input({ state: ahead }))).toMatchObject({
      pill: { text: "Signed in", tone: "in" },
      staleWarning: null,
    });
  });

  it("labels a signed-in result 'Last known' when the last check failed", () => {
    const failed: AccountState = { ...signedIn, lastError: { reason: "network", at: NOW } };
    expect(describeStatus(input({ state: failed })).pill).toEqual({
      text: "Last known",
      tone: "warn",
    });
  });

  it("says so when the account has no email", () => {
    expect(
      describeStatus(input({ state: { status: "signedIn", checkedAt: NOW, generation: 0 } }))
        .headline,
    ).toBe("Signed in — this account has no email address");
  });

  it("shows a grey pill and names the marketplace when signed out, with no email", () => {
    const view = describeStatus(
      input({ state: { status: "signedOut", checkedAt: NOW, generation: 0 } }),
    );
    expect(view).toMatchObject({
      headline: "No account is signed in on Amazon.de in this browser.",
      email: null,
      detail: "Checked just now, at 14:30",
      pill: { text: "Not signed in", tone: "out" },
    });
  });

  it("offers a sign-in link to the marketplace when nobody is signed in there", () => {
    const view = describeStatus(
      input({ state: { status: "signedOut", checkedAt: NOW, generation: 0 } }),
    );
    expect(view.link).toEqual({
      text: "Sign in on Amazon.de",
      href: buildSigninUrl(MARKETPLACES.de),
    });
  });

  it("prefers the verification link when a signed-out marketplace then asked for verification", () => {
    const state: AccountState = {
      status: "signedOut",
      checkedAt: NOW,
      generation: 0,
      lastError: { reason: "challenge", at: NOW },
    };
    expect(describeStatus(input({ state })).link?.text).toBe("Open Amazon.de");
  });

  it("shows an orange 'Verification needed' pill when Amazon asks for a visit", () => {
    const state: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "challenge", at: NOW },
    };
    expect(describeStatus(input({ state })).pill).toEqual({
      text: "Verification needed",
      tone: "warn",
    });
  });

  it("shows no pill while nothing is known yet", () => {
    expect(describeStatus(input({ checking: true })).pill).toBeNull();
    expect(describeStatus(input({ state: { status: "unknown", generation: 0 } })).pill).toBeNull();
  });

  it("keeps the cached result visible while checking", () => {
    expect(describeStatus(input({ state: signedIn, checking: true }))).toMatchObject({
      email: TEST_EMAIL_TEXT,
      detail: "Checking…",
    });
    expect(describeStatus(input({ checking: true })).headline).toBe("Checking…");
  });

  it("explains a challenge with the time automatic checks resume and the age of the kept result", () => {
    const state: AccountState = { ...signedIn, lastError: { reason: "challenge", at: NOW } };
    expect(
      describeStatus(input({ state, throttle: { failures: 1, nextAllowedAt: NOW + 1 } })),
    ).toMatchObject({
      email: TEST_EMAIL_TEXT,
      detail:
        "Amazon asked for verification. Open Amazon.de in a tab once, then press Check now (automatic checks resume after 14:30). Showing the result from 2 min ago.",
      pill: { text: "Last known", tone: "warn" },
    });
  });

  it("throttled market with nothing cached shows the verification text, not Checking…", () => {
    const view = describeStatus(input({ throttle: { failures: 1, nextAllowedAt: NOW + 60_000 } }));
    expect(view.headline).toBe(
      "Amazon asked for verification. Open Amazon.de in a tab once, then press Check now (automatic checks resume after 14:30).",
    );
    expect(view.pill).toEqual({ text: "Verification needed", tone: "warn" });
  });

  it("states the bare verification text when no throttle entry exists", () => {
    const state: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "challenge", at: NOW },
    };
    expect(describeStatus(input({ state })).headline).toBe(
      "Amazon asked for verification. Open Amazon.de in a tab once, then press Check now.",
    );
  });

  it("names the marketplace and appends the age when a challenge has no throttle entry", () => {
    const state: AccountState = { ...signedIn, lastError: { reason: "challenge", at: NOW } };
    expect(describeStatus(input({ state, marketplace: MARKETPLACES.uk })).detail).toBe(
      "Amazon asked for verification. Open Amazon.co.uk in a tab once, then press Check now. Showing the result from 2 min ago.",
    );
  });

  it("keeps the rate-limited wording free of the open-the-site advice", () => {
    const state: AccountState = { ...signedIn, lastError: { reason: "rateLimited", at: NOW } };
    expect(
      describeStatus(input({ state, throttle: { failures: 1, nextAllowedAt: NOW + 1 } })).detail,
    ).toBe(
      "Amazon asked for verification. Automatic checks resume after 14:30. Showing the result from 2 min ago.",
    );
  });

  it("unknown state, not checking, not throttled shows Not checked yet", () => {
    expect(describeStatus(input({ state: { status: "unknown", generation: 0 } }))).toMatchObject({
      headline: "Not checked yet — press Check now.",
      pill: null,
    });
  });

  it("keeps showing Checking… for a throttled market while a manual check runs", () => {
    expect(
      describeStatus(
        input({ checking: true, throttle: { failures: 1, nextAllowedAt: NOW + 60_000 } }),
      ).headline,
    ).toBe("Checking…");
  });

  it("shows how old the kept result is after a network failure", () => {
    const state: AccountState = { ...signedIn, lastError: { reason: "timeout", at: NOW } };
    expect(describeStatus(input({ state })).detail).toBe(
      "Couldn't reach Amazon. Showing the result from 2 min ago.",
    );
  });

  it("shows the reason as the headline when nothing was ever confirmed", () => {
    const parse: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "parse", at: NOW },
    };
    const mismatch: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "sessionMismatch", at: NOW },
    };
    expect(describeStatus(input({ state: parse })).headline).toBe("Couldn't read Amazon's answer.");
    expect(describeStatus(input({ state: mismatch })).headline).toBe(
      "Couldn't confirm the session. If you block third-party cookies, that can stop the check.",
    );
  });

  it("marks a result dated in the future as stale, since only a clock change can cause it", () => {
    expect(
      describeStatus(input({ state: { ...signedIn, checkedAt: NOW + 120_000 } })),
    ).toMatchObject({
      pill: { text: "Last known", tone: "warn" },
      staleWarning:
        "This result is dated in the future, so the clock may have changed; press Check now.",
    });
  });

  it("reports a failed start as the headline when nothing was confirmed, even after an earlier error", () => {
    const state: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "parse", at: NOW },
    };
    expect(describeStatus(input({ state, startFailed: true }))).toMatchObject({
      headline: "Couldn't start the check",
      detail: null,
    });
  });

  it("reports when the check could not be started at all", () => {
    expect(describeStatus(input({ state: signedIn, startFailed: true })).detail).toBe(
      "Couldn't start the check",
    );
  });
});
