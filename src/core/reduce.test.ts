import { describe, expect, it } from "vitest";
import { OTHER_HASH, TEST_EMAIL } from "@/test/data";
import {
  invalidatedByCookie,
  nextState,
  sameState,
  signedOutByCookie,
  withEmailHash,
} from "./reduce";
import type { AccountState } from "./state";

const signedIn: AccountState = {
  status: "signedIn",
  email: TEST_EMAIL,
  checkedAt: 1,
  generation: 2,
};

describe("nextState", () => {
  it("replaces the state on a definite answer and clears the last error", () => {
    expect(
      nextState(
        { ...signedIn, lastError: { reason: "timeout", at: 5 } },
        { kind: "signedOut" },
        10,
      ),
    ).toEqual({
      status: "signedOut",
      checkedAt: 10,
      generation: 2,
    });
  });

  it("keeps the last result on a failure and marks it stale, so an error is never 'signed out'", () => {
    expect(nextState(signedIn, { kind: "failed", reason: "network" }, 10)).toEqual({
      ...signedIn,
      lastError: { reason: "network", at: 10 },
    });
  });

  it("starts from unknown when the first check fails", () => {
    expect(nextState(undefined, { kind: "failed", reason: "challenge" }, 10)).toEqual({
      status: "unknown",
      generation: 0,
      lastError: { reason: "challenge", at: 10 },
    });
  });

  it("stores no email field when signed in without an email", () => {
    expect(nextState(undefined, { kind: "signedIn", email: null }, 10)).toEqual({
      status: "signedIn",
      checkedAt: 10,
      generation: 0,
    });
  });
});

describe("nextState on a session mismatch", () => {
  it("drops the cached email, because an unconfirmed email must not stay on screen", () => {
    expect(nextState(signedIn, { kind: "failed", reason: "sessionMismatch" }, 10)).toEqual({
      status: "unknown",
      generation: 2,
      lastError: { reason: "sessionMismatch", at: 10 },
    });
  });
});

describe("invalidatedByCookie", () => {
  it("forgets the account and bumps the generation when the session cookie is rewritten", () => {
    expect(invalidatedByCookie(signedIn)).toEqual({ status: "unknown", generation: 3 });
    expect(invalidatedByCookie(undefined)).toEqual({ status: "unknown", generation: 1 });
  });
});

describe("signedOutByCookie", () => {
  it("drops the email and bumps the generation so a check already running cannot restore it", () => {
    expect(signedOutByCookie(signedIn, 20)).toEqual({
      status: "signedOut",
      checkedAt: 20,
      generation: 3,
    });
  });
});

describe("sameState", () => {
  it("detects an unchanged state so storage is not rewritten", () => {
    expect(sameState(signedIn, { ...signedIn })).toBe(true);
    expect(sameState(signedIn, { ...signedIn, checkedAt: 2 })).toBe(false);
    expect(sameState(undefined, signedIn)).toBe(false);
  });
});

describe("withEmailHash", () => {
  const hash = OTHER_HASH;

  it("stores the hash next to the email so the popup and badge can match without hashing", () => {
    expect(withEmailHash(signedIn, hash)).toEqual({ ...signedIn, emailHash: hash });
  });

  it("adds nothing to a state without an email or when no hash is known", () => {
    const out: AccountState = { status: "signedOut", checkedAt: 1, generation: 0 };
    expect(withEmailHash(out, hash)).toBe(out);
    expect(withEmailHash(signedIn, null)).toBe(signedIn);
  });

  it("drops the hash together with the email on a new definite answer", () => {
    const hashed = withEmailHash(signedIn, hash);
    expect(nextState(hashed, { kind: "signedOut" }, 10)).not.toHaveProperty("emailHash");
    expect(invalidatedByCookie(hashed)).not.toHaveProperty("emailHash");
  });

  it("counts a newly added hash as a change, so it is written even when the email is the same", () => {
    expect(sameState(signedIn, withEmailHash(signedIn, hash))).toBe(false);
  });
});
