import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STORED_HINT, testEmail } from "@/test/data";
import { hashEmail, maskEmail, matchStatus, normalizeEmail } from "./expected";
import type { AccountState, ExpectedEntry } from "./state";

const OWNER = testEmail("orders@example.com");
const OTHER = testEmail("personal@example.com");
const NOW = 1_000_000;
const entry: ExpectedEntry = { hash: "a".repeat(64), hint: STORED_HINT };

function signedIn(emailHash: string | null): AccountState {
  return emailHash === null
    ? { status: "signedIn", checkedAt: NOW, generation: 0 }
    : { status: "signedIn", email: OWNER, emailHash, checkedAt: NOW, generation: 0 };
}

describe("normalizeEmail", () => {
  it("trims and lower-cases so the same address always hashes the same", () => {
    expect(normalizeEmail("  Orders@Example.COM ")).toBe("orders@example.com");
  });

  it("is idempotent, so normalising a stored value twice changes nothing", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(normalizeEmail(normalizeEmail(raw))).toBe(normalizeEmail(raw));
      }),
    );
  });
});

describe("maskEmail", () => {
  it("keeps the first and last character of a longer local part and masks every domain label but the TLD", () => {
    expect(maskEmail("Orders.US@Example.com")).toBe("o•••s@e•••.com");
    expect(maskEmail(["ab", "corp.co.uk"].join("@"))).toBe("•@c•••.c•••.uk");
  });

  it("masks local parts of one, two or three characters completely", () => {
    expect(maskEmail("a@example.com")).toBe("•@e•••.com");
    expect(maskEmail("ab@example.com")).toBe("•@e•••.com");
    expect(maskEmail("abc@example.com")).toBe("•@e•••.com");
    expect(maskEmail("abcd@example.com")).toBe("a•••d@e•••.com");
  });

  it("never reveals the whole local part or any whole domain label except the TLD", () => {
    const local = fc.stringMatching(/^[a-z0-9._-]{1,30}$/u);
    const label = fc.stringMatching(/^[a-z0-9-]{1,20}$/u);
    const labels = fc.array(label, { minLength: 1, maxLength: 4 });
    fc.assert(
      fc.property(local, labels, label, (part, names, tld) => {
        const [maskedLocal = "", maskedDomain = ""] = maskEmail(
          `${part}@${[...names, tld].join(".")}`,
        ).split("@");
        const maskedLabels = maskedDomain.split(".");
        expect(maskedLocal.includes(part)).toBe(false);
        expect(maskedLabels.at(-1)).toBe(tld);
        for (const [index, name] of names.entries()) {
          expect(maskedLabels[index]?.includes(name)).toBe(false);
        }
      }),
    );
  });
});

describe("hashEmail", () => {
  it("hashes the normalised address with SHA-256 as lower-case hex", async () => {
    const plain = await hashEmail("orders@example.com", crypto.subtle);
    expect(plain).toMatch(/^[\da-f]{64}$/u);
    expect(await hashEmail(" ORDERS@example.com", crypto.subtle)).toBe(plain);
    expect(await hashEmail("other@example.com", crypto.subtle)).not.toBe(plain);
  });
});

describe("matchStatus", () => {
  it("is 'none' while no expected account is set, whatever the state", () => {
    expect(matchStatus(signedIn("b".repeat(64)), undefined)).toBe("none");
    expect(matchStatus(undefined, undefined)).toBe("none");
  });

  it("compares the hash stored with the account with the expected one", () => {
    expect(matchStatus(signedIn(entry.hash), entry)).toBe("match");
    expect(matchStatus(signedIn("b".repeat(64)), entry)).toBe("mismatch");
  });

  it("stays 'unknown' when the account has no email or no stored hash", () => {
    const withoutHash: AccountState = {
      status: "signedIn",
      email: OWNER,
      checkedAt: NOW,
      generation: 0,
    };
    expect(matchStatus(withoutHash, entry)).toBe("unknown");
    expect(matchStatus(signedIn(null), entry)).toBe("unknown");
  });

  it("is 'missing' when nobody is signed in where an account is expected", () => {
    const out: AccountState = { status: "signedOut", checkedAt: NOW, generation: 0 };
    expect(matchStatus(out, entry)).toBe("missing");
  });

  it("is 'missing' when the session could not be confirmed, because the email was dropped", () => {
    const mismatch: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "sessionMismatch", at: NOW },
    };
    expect(matchStatus(mismatch, entry)).toBe("missing");
  });

  it("is 'unknown' for a never-checked state or a challenge without a cached result", () => {
    const challenge: AccountState = {
      status: "unknown",
      generation: 0,
      lastError: { reason: "challenge", at: NOW },
    };
    expect(matchStatus(undefined, entry)).toBe("unknown");
    expect(matchStatus(challenge, entry)).toBe("unknown");
  });

  it("keeps judging the cached account while a later check failed", () => {
    const stale: AccountState = {
      status: "signedIn",
      email: OTHER,
      emailHash: "c".repeat(64),
      checkedAt: NOW,
      generation: 0,
      lastError: { reason: "network", at: NOW },
    };
    expect(matchStatus(stale, entry)).toBe("mismatch");
  });
});
