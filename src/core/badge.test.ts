import { describe, expect, it } from "vitest";
import { badgeFor } from "./badge";
import { parseEmail } from "./email";
import { MARKETPLACES } from "./marketplaces";
import type { MatchStatus } from "./expected";
import type { AccountState } from "./state";

const email = parseEmail("test.user@example.com");
if (email === null) {
  throw new Error("fixture email must parse");
}

const NOW = 1_000_000;
const STATES: Readonly<Record<string, AccountState | undefined>> = {
  never: undefined,
  forgotten: { status: "unknown", generation: 1 },
  signedIn: { status: "signedIn", email, checkedAt: NOW, generation: 0 },
  signedInNoEmail: { status: "signedIn", checkedAt: NOW, generation: 0 },
  signedOut: { status: "signedOut", checkedAt: NOW, generation: 0 },
  challenge: { status: "unknown", generation: 0, lastError: { reason: "challenge", at: NOW } },
  rateLimited: {
    status: "signedIn",
    email,
    checkedAt: NOW,
    generation: 0,
    lastError: { reason: "rateLimited", at: NOW },
  },
  offline: {
    status: "signedIn",
    email,
    checkedAt: NOW,
    generation: 0,
    lastError: { reason: "network", at: NOW },
  },
};

const RED = { text: "!", color: "#c0261a" };
const GREEN = { text: "DE", color: "#11795a" };
const GREY = { text: "DE", color: "#5f6878" };
const ORANGE = { text: "DE", color: "#a14a06" };
const EMPTY = { text: "", color: "#5f6878" };

describe("badgeFor", () => {
  it.each<[string, MatchStatus, { text: string; color: string }]>([
    ["signedIn", "mismatch", RED],
    ["signedOut", "missing", RED],
    ["challenge", "missing", RED],
    ["signedIn", "match", GREEN],
    ["signedIn", "none", GREEN],
    ["offline", "none", GREEN],
    ["signedOut", "none", GREY],
    ["challenge", "none", ORANGE],
    ["challenge", "unknown", ORANGE],
    ["rateLimited", "none", ORANGE],
    ["signedInNoEmail", "unknown", EMPTY],
    ["signedInNoEmail", "none", GREEN],
    ["forgotten", "none", EMPTY],
    ["forgotten", "unknown", EMPTY],
    ["never", "none", EMPTY],
    ["never", "unknown", EMPTY],
  ])("shows %s with match '%s' as the expected badge", (name, match, badge) => {
    expect(badgeFor(MARKETPLACES.de, STATES[name], match)).toEqual(badge);
  });
});
