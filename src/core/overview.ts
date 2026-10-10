import { isThrottled } from "./backoff";
import { formatShortAge, isStale } from "./freshness";
import { MARKETPLACE_IDS } from "./marketplaces";
import type { MatchStatus } from "./expected";
import type { Marketplace } from "./marketplaces";
import type { AccountState, ThrottleEntry } from "./state";

type DotTone = "in" | "out" | "warn" | "bad" | "none";

export interface OverviewInput {
  readonly marketplace: Marketplace;
  readonly state: AccountState | undefined;
  readonly throttle: ThrottleEntry | undefined;
  readonly match: MatchStatus;
  readonly now: number;
}

export interface MarketplaceOverview {
  readonly line: string;
  readonly tone: DotTone;
  readonly age: string | null;
  readonly stale: boolean;
  readonly signedIn: boolean;
  readonly wrong: boolean;
}

function needsVisit(input: OverviewInput): boolean {
  const { state } = input;
  if (state?.lastError?.reason === "challenge") {
    return true;
  }
  return state?.checkedAt === undefined && isThrottled(input.throttle, input.now);
}

function unconfirmedLine(state: AccountState | undefined): string {
  return state?.lastError?.reason === "sessionMismatch"
    ? "Couldn't confirm the session"
    : "Not checked yet";
}

function stateLine(state: AccountState | undefined): string {
  if (state?.status === "signedIn") {
    return state.email ?? "Signed in, no email";
  }
  return state?.status === "signedOut" ? "Not signed in" : unconfirmedLine(state);
}

function lineOf(input: OverviewInput): string {
  if (input.match === "mismatch" && input.state?.email !== undefined) {
    return `Wrong account: ${input.state.email}`;
  }
  return needsVisit(input)
    ? `Needs one visit to ${input.marketplace.label}`
    : stateLine(input.state);
}

const STATUS_TONE: Readonly<Record<AccountState["status"], DotTone>> = {
  signedIn: "in",
  signedOut: "out",
  unknown: "none",
};
const BAD_MATCHES: ReadonlySet<MatchStatus> = new Set(["mismatch", "missing"]);
const WARN_REASONS: ReadonlySet<string> = new Set(["rateLimited", "sessionMismatch"]);

function toneOf(input: OverviewInput): DotTone {
  const { state } = input;
  if (BAD_MATCHES.has(input.match)) {
    return "bad";
  }
  if (needsVisit(input) || WARN_REASONS.has(state?.lastError?.reason ?? "")) {
    return "warn";
  }
  return state === undefined ? "none" : STATUS_TONE[state.status];
}

export function describeMarketplace(input: OverviewInput): MarketplaceOverview {
  const checkedAt = input.state?.checkedAt;
  return {
    line: lineOf(input),
    tone: toneOf(input),
    age: checkedAt === undefined ? null : formatShortAge(checkedAt, input.now),
    stale: isStale(input.state, input.now),
    signedIn: input.state?.status === "signedIn",
    wrong: input.match === "mismatch",
  };
}

export function summaryText(
  entries: readonly Pick<MarketplaceOverview, "signedIn" | "wrong">[],
): string {
  const signedIn = entries.filter((entry) => entry.signedIn).length;
  const wrong = entries.filter((entry) => entry.wrong).length;
  const base = `${String(signedIn)} of ${String(MARKETPLACE_IDS.length)} marketplaces signed in`;
  if (wrong === 0) {
    return base;
  }
  return `${base}, ${String(wrong)} wrong account${wrong === 1 ? "" : "s"}`;
}
