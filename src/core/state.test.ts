import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  AccountsSchema,
  CheckMessageSchema,
  EMPTY_ACCOUNTS,
  EMPTY_EXPECTED,
  EMPTY_THROTTLE,
  ExpectedSchema,
  parseOr,
  ThrottleSchema,
} from "./state";

describe("storage schemas", () => {
  it("round-trips a stored signed-in state", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: {
        us: { status: "signedIn", email: "test.user@example.com", checkedAt: 1, generation: 0 },
      },
    };
    expect(parseOr(AccountsSchema, stored, EMPTY_ACCOUNTS)).toEqual(stored);
  });

  it("round-trips the email hash kept next to the email in the session area", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: {
        us: {
          status: "signedIn",
          email: "test.user@example.com",
          emailHash: "0f".repeat(32),
          checkedAt: 1,
          generation: 0,
        },
      },
    };
    expect(parseOr(AccountsSchema, stored, EMPTY_ACCOUNTS)).toEqual(stored);
  });

  it("drops an account state whose email hash is not a SHA-256 hex digest", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: {
        us: { status: "signedIn", email: "test.user@example.com", emailHash: "x", generation: 0 },
      },
    };
    expect(parseOr(AccountsSchema, stored, EMPTY_ACCOUNTS)).toBe(EMPTY_ACCOUNTS);
  });

  it("round-trips the time of the last manual check kept in the throttle blob", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: { us: { failures: 0, nextAllowedAt: 0, lastManualAt: 5000 } },
    };
    expect(parseOr(ThrottleSchema, stored, EMPTY_THROTTLE)).toEqual(stored);
  });

  it("drops a blob from an unknown schema version instead of crashing the worker", () => {
    expect(parseOr(AccountsSchema, { schemaVersion: 2, byMarketplace: {} }, EMPTY_ACCOUNTS)).toBe(
      EMPTY_ACCOUNTS,
    );
    expect(parseOr(AccountsSchema, "garbage", EMPTY_ACCOUNTS)).toBe(EMPTY_ACCOUNTS);
  });

  it("rejects a stored email that is not a valid address", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: { us: { status: "signedIn", email: "nope", generation: 0 } },
    };
    expect(parseOr(AccountsSchema, stored, EMPTY_ACCOUNTS)).toBe(EMPTY_ACCOUNTS);
  });

  it("drops a throttle whose next-allowed time no Date can represent", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: { us: { failures: 1, nextAllowedAt: 1e20 } },
    };
    expect(parseOr(ThrottleSchema, stored, EMPTY_THROTTLE)).toBe(EMPTY_THROTTLE);
  });

  it("round-trips an expected account stored as a hash and a masked hint, never the email", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: { de: { hash: "0f".repeat(32), hint: "o•••s@example.com" } },
    };
    expect(parseOr(ExpectedSchema, stored, EMPTY_EXPECTED)).toEqual(stored);
  });

  it("drops an expected entry whose hash is not a SHA-256 hex digest", () => {
    const stored = {
      schemaVersion: 1,
      byMarketplace: { de: { hash: "orders@example.com", hint: "o•••s@example.com" } },
    };
    expect(parseOr(ExpectedSchema, stored, EMPTY_EXPECTED)).toBe(EMPTY_EXPECTED);
  });

  it("accepts only check messages that name a known marketplace, never a URL", () => {
    expect(v.is(CheckMessageSchema, { type: "check", marketplace: "de", manual: false })).toBe(
      true,
    );
    expect(
      v.is(CheckMessageSchema, {
        type: "check",
        marketplace: "https://evil.example.com",
        manual: false,
      }),
    ).toBe(false);
  });
});
