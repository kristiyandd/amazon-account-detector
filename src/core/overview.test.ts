import { describe, expect, it } from "vitest";
import { parseEmail } from "./email";
import { MARKETPLACES } from "./marketplaces";
import { describeMarketplace, summaryText } from "./overview";
import type { OverviewInput } from "./overview";
import type { AccountState } from "./state";

const email = parseEmail("test.user@example.com");
if (email === null) {
  throw new Error("fixture email must parse");
}

const NOW = 100_000_000;
const signedIn: AccountState = {
  status: "signedIn",
  email,
  checkedAt: NOW - 120_000,
  generation: 0,
};

function input(overrides: Partial<OverviewInput>): OverviewInput {
  return {
    marketplace: MARKETPLACES.fr,
    state: undefined,
    throttle: undefined,
    match: "none",
    now: NOW,
    ...overrides,
  };
}

describe("describeMarketplace", () => {
  it("shows the email, its age and a green dot for a signed-in market", () => {
    expect(describeMarketplace(input({ state: signedIn }))).toEqual({
      line: "test.user@example.com",
      tone: "in",
      age: "2 min",
      stale: false,
      signedIn: true,
      wrong: false,
    });
  });

  it("names the wrong account in red when it is not the expected one", () => {
    expect(describeMarketplace(input({ state: signedIn, match: "mismatch" }))).toMatchObject({
      line: "Wrong account: test.user@example.com",
      tone: "bad",
      wrong: true,
    });
  });

  it("marks a signed-out market red only when an account is expected there", () => {
    const out: AccountState = { status: "signedOut", checkedAt: NOW, generation: 0 };
    expect(describeMarketplace(input({ state: out }))).toMatchObject({
      line: "Not signed in",
      tone: "out",
      signedIn: false,
    });
    expect(describeMarketplace(input({ state: out, match: "missing" })).tone).toBe("bad");
  });

  it("asks for one visit when Amazon answered with a challenge", () => {
    const challenge: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "challenge", at: NOW },
    };
    expect(describeMarketplace(input({ state: challenge }))).toMatchObject({
      line: "Needs one visit to Amazon.fr",
      tone: "warn",
      age: null,
    });
  });

  it("asks for one visit while checks are throttled and no result exists", () => {
    expect(
      describeMarketplace(input({ throttle: { failures: 1, nextAllowedAt: NOW + 1000 } })).line,
    ).toBe("Needs one visit to Amazon.fr");
  });

  it("says a market was never checked without a dot colour", () => {
    expect(describeMarketplace(input({}))).toMatchObject({
      line: "Not checked yet",
      tone: "none",
      age: null,
    });
  });

  it("covers the remaining states with their own line", () => {
    const noEmail: AccountState = { status: "signedIn", checkedAt: NOW, generation: 0 };
    const unconfirmed: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "sessionMismatch", at: NOW },
    };
    const limited: AccountState = {
      ...signedIn,
      lastError: { reason: "rateLimited", at: NOW },
    };
    expect(describeMarketplace(input({ state: noEmail })).line).toBe("Signed in, no email");
    expect(describeMarketplace(input({ state: unconfirmed })).line).toBe(
      "Couldn't confirm the session",
    );
    expect(describeMarketplace(input({ state: limited })).tone).toBe("warn");
  });

  it("flags a result older than 24 h so the menu shows its age in orange", () => {
    const old: AccountState = { ...signedIn, checkedAt: NOW - 90_000_000 };
    expect(describeMarketplace(input({ state: old }))).toMatchObject({ age: "1 d", stale: true });
  });
});

describe("summaryText", () => {
  const entry = (signedInFlag: boolean, wrong: boolean): { signedIn: boolean; wrong: boolean } => ({
    signedIn: signedInFlag,
    wrong,
  });

  it("counts signed-in marketplaces out of all five", () => {
    expect(summaryText([entry(true, false), entry(false, false)])).toBe(
      "1 of 5 marketplaces signed in",
    );
  });

  it("adds the wrong accounts, singular and plural", () => {
    expect(summaryText([entry(true, true), entry(true, false)])).toBe(
      "2 of 5 marketplaces signed in, 1 wrong account",
    );
    expect(summaryText([entry(true, true), entry(true, true)])).toBe(
      "2 of 5 marketplaces signed in, 2 wrong accounts",
    );
  });
});
