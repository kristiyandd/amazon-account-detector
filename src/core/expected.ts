import { MARKETPLACE_IDS } from "./marketplaces";
import type { MarketplaceId } from "./marketplaces";
import type { AccountState, Expected, ExpectedEntry } from "./state";

export type MatchStatus = "none" | "match" | "mismatch" | "missing" | "unknown";

export interface Digester {
  digest(algorithm: "SHA-256", data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>;
}

const MASK = "•";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const SHORT_LOCAL_PART = 3;

function maskLocal(local: string): string {
  const chars = Array.from(local);
  const first = chars.at(0) ?? "";
  const last = chars.at(-1) ?? "";
  return chars.length > SHORT_LOCAL_PART ? `${first}${MASK.repeat(3)}${last}` : MASK;
}

function maskLabel(label: string): string {
  const chars = Array.from(label);
  return chars.length > 1 ? `${chars[0] ?? ""}${MASK.repeat(3)}` : MASK;
}

function maskDomain(domain: string): string {
  const labels = domain.split(".");
  const tld = labels.at(-1) ?? "";
  return labels.length > 1 ? [...labels.slice(0, -1).map(maskLabel), tld].join(".") : MASK;
}

export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  return `${maskLocal(normalized.slice(0, Math.max(0, at)))}@${maskDomain(normalized.slice(at + 1))}`;
}

export async function hashEmail(email: string, subtle: Digester): Promise<string> {
  const data = new TextEncoder().encode(normalizeEmail(email));
  const digest = new Uint8Array(await subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function lostSession(state: AccountState | undefined): boolean {
  return (
    state?.status === "signedOut" ||
    (state?.status === "unknown" && state.lastError?.reason === "sessionMismatch")
  );
}

export function matchStatus(
  state: AccountState | undefined,
  expected: ExpectedEntry | undefined,
): MatchStatus {
  if (expected === undefined) {
    return "none";
  }
  if (lostSession(state)) {
    return "missing";
  }
  if (state?.status !== "signedIn" || state.email === undefined || state.emailHash === undefined) {
    return "unknown";
  }
  return state.emailHash === expected.hash ? "match" : "mismatch";
}

export function withExpected(
  expected: Expected,
  id: MarketplaceId,
  entry: ExpectedEntry | null,
): Expected {
  const byMarketplace = MARKETPLACE_IDS.reduce<Expected["byMarketplace"]>((next, key) => {
    const value = key === id ? entry : expected.byMarketplace[key];
    return value === null || value === undefined ? next : { ...next, [key]: value };
  }, {});
  return { schemaVersion: 1, byMarketplace };
}
