import { describe, expect, it } from "vitest";
import { formatAge, formatShortAge, isStale, needsCheck } from "./freshness";

describe("formatAge", () => {
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [180_000, "3 min ago"],
    [7_200_000, "2 h ago"],
    [172_800_000, "2 d ago"],
    [-60_000, "just now"],
  ])("shows %i ms as %s", (age, text) => {
    expect(formatAge(1_000_000_000 - age, 1_000_000_000)).toBe(text);
  });
});

describe("formatShortAge", () => {
  it.each([
    [0, "now"],
    [180_000, "3 min"],
    [7_200_000, "2 h"],
    [172_800_000, "2 d"],
  ])("shows %i ms as %s in the menu's narrow age column", (age, text) => {
    expect(formatShortAge(1_000_000_000 - age, 1_000_000_000)).toBe(text);
  });
});

describe("isStale", () => {
  const now = 1_000_000_000;

  it("flags a successful result older than 24 h so the popup can warn about it", () => {
    expect(isStale({ status: "signedIn", checkedAt: now - 86_400_001, generation: 0 }, now)).toBe(
      true,
    );
    expect(isStale({ status: "signedIn", checkedAt: now - 86_400_000, generation: 0 }, now)).toBe(
      false,
    );
  });

  it("leaves failed and never-checked states to their own error text", () => {
    expect(
      isStale(
        {
          status: "signedIn",
          checkedAt: 0,
          generation: 0,
          lastError: { reason: "network", at: now },
        },
        now,
      ),
    ).toBe(false);
    expect(isStale(undefined, now)).toBe(false);
  });
});

describe("needsCheck", () => {
  const now = 1_000_000;

  it("skips a check that succeeded less than a minute ago", () => {
    expect(
      needsCheck({ status: "signedOut", checkedAt: now - 30_000, generation: 0 }, undefined, now),
    ).toBe(false);
  });

  it("checks when the data is older, failed, missing or dated in the future", () => {
    expect(
      needsCheck({ status: "signedOut", checkedAt: now - 61_000, generation: 0 }, undefined, now),
    ).toBe(true);
    expect(
      needsCheck(
        {
          status: "signedOut",
          checkedAt: now,
          generation: 0,
          lastError: { reason: "network", at: now },
        },
        undefined,
        now,
      ),
    ).toBe(true);
    expect(needsCheck(undefined, undefined, now)).toBe(true);
    expect(
      needsCheck({ status: "signedOut", checkedAt: now + 60_000, generation: 0 }, undefined, now),
    ).toBe(true);
  });

  it("does not check automatically while throttled", () => {
    expect(needsCheck(undefined, { failures: 1, nextAllowedAt: now + 1000 }, now)).toBe(false);
  });
});
