import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CHALLENGE_CAP_MS,
  challengeDelay,
  isThrottled,
  manualCooldownLeft,
  nextThrottle,
  NO_THROTTLE,
  parseRetryAfter,
  retryDelay,
  withManualCheck,
} from "./backoff";

const half = (): number => 0.5;

describe("challenge backoff", () => {
  it("waits 15 to 30 min after the first challenge, never zero", () => {
    expect(challengeDelay(1, () => 0)).toBe(900_000);
    expect(challengeDelay(1, () => 1)).toBe(1_800_000);
  });

  it("doubles per failure and never exceeds 6 h", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (failures, r) => {
          const delay = challengeDelay(failures, () => r);
          expect(delay).toBeGreaterThan(0);
          expect(delay).toBeLessThanOrEqual(CHALLENGE_CAP_MS);
        },
      ),
    );
  });

  it("counts a challenge, honours a longer Retry-After and resets after a definite answer", () => {
    const first = nextThrottle(
      undefined,
      { kind: "failed", reason: "challenge" },
      { now: 0, random: half, retryAfterMs: null },
    );
    expect(first).toEqual({ failures: 1, nextAllowedAt: 1_350_000 });
    const limited = nextThrottle(
      first,
      { kind: "failed", reason: "rateLimited" },
      { now: 0, random: half, retryAfterMs: 5_000_000 },
    );
    expect(limited).toEqual({ failures: 2, nextAllowedAt: 5_000_000 });
    const capped = nextThrottle(
      limited,
      { kind: "failed", reason: "rateLimited" },
      { now: 0, random: half, retryAfterMs: 99_999_999 },
    );
    expect(capped.nextAllowedAt).toBe(CHALLENGE_CAP_MS);
    expect(
      nextThrottle(limited, { kind: "signedOut" }, { now: 0, random: half, retryAfterMs: null }),
    ).toEqual({ failures: 0, nextAllowedAt: 0 });
  });

  it("keeps the time of the last manual check through a reset and a new challenge", () => {
    const entry = { failures: 1, nextAllowedAt: 5, lastManualAt: 3 };
    const context = { now: 0, random: half, retryAfterMs: null };
    expect(nextThrottle(entry, { kind: "signedOut" }, context)).toEqual({
      failures: 0,
      nextAllowedAt: 0,
      lastManualAt: 3,
    });
    expect(nextThrottle(entry, { kind: "failed", reason: "challenge" }, context)).toMatchObject({
      failures: 2,
      lastManualAt: 3,
    });
  });

  it("leaves the throttle alone after network errors", () => {
    const entry = { failures: 1, nextAllowedAt: 5 };
    expect(
      nextThrottle(
        entry,
        { kind: "failed", reason: "network" },
        { now: 0, random: half, retryAfterMs: null },
      ),
    ).toBe(entry);
  });
});

describe("isThrottled", () => {
  it("throttles until nextAllowedAt", () => {
    expect(isThrottled({ failures: 1, nextAllowedAt: 100 }, 50)).toBe(true);
    expect(isThrottled({ failures: 1, nextAllowedAt: 100 }, 100)).toBe(false);
    expect(isThrottled(undefined, 0)).toBe(false);
  });

  it("ignores a wait longer than the cap, which only a clock moved back can produce", () => {
    expect(isThrottled({ failures: 3, nextAllowedAt: CHALLENGE_CAP_MS * 10 }, 0)).toBe(false);
  });
});

describe("retry helpers", () => {
  it("jitters the network retry within 1 s, then 2 s", () => {
    expect(retryDelay(0, () => 1)).toBe(1000);
    expect(retryDelay(1, () => 1)).toBe(2000);
  });

  it("reads Retry-After as seconds or as an HTTP date", () => {
    expect(parseRetryAfter("120", 0)).toBe(120_000);
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 0)).toBe(60_000);
    expect(parseRetryAfter("soon", 0)).toBeNull();
    expect(parseRetryAfter(null, 0)).toBeNull();
  });
});

describe("manualCooldownLeft", () => {
  it("counts down the 30 s after a manual check and is zero without one", () => {
    expect(manualCooldownLeft(1000, 1000)).toBe(30_000);
    expect(manualCooldownLeft(1000, 19_000)).toBe(12_000);
    expect(manualCooldownLeft(1000, 31_000)).toBe(0);
    expect(manualCooldownLeft(undefined, 1000)).toBe(0);
  });

  it("ignores a manual check dated in the future, which only a clock moved back can produce", () => {
    expect(manualCooldownLeft(90_000, 1000)).toBe(0);
  });
});

describe("withManualCheck", () => {
  it("records the manual check and keeps the backoff, so a click never resets a challenge wait", () => {
    expect(withManualCheck({ failures: 2, nextAllowedAt: 500 }, 1000)).toEqual({
      failures: 2,
      nextAllowedAt: 500,
      lastManualAt: 1000,
    });
    expect(withManualCheck(undefined, 1000)).toEqual({ ...NO_THROTTLE, lastManualAt: 1000 });
  });
});
