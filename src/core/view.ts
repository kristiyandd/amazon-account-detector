import { isThrottled } from "./backoff";
import { formatAge, isStale } from "./freshness";
import { originOf } from "./marketplaces";
import { buildSigninUrl } from "./signin-url";
import type { Marketplace } from "./marketplaces";
import type { AccountState, Reason, ThrottleEntry } from "./state";

interface StatusLink {
  readonly text: string;
  readonly href: string;
}

interface StatusPill {
  readonly text: string;
  readonly tone: "in" | "out" | "warn";
}

export interface StatusView {
  readonly headline: string;
  readonly email: string | null;
  readonly detail: string | null;
  readonly pill: StatusPill | null;
  readonly staleWarning: string | null;
  readonly link: StatusLink | null;
}

export interface ViewInput {
  readonly state: AccountState | undefined;
  readonly throttle: ThrottleEntry | undefined;
  readonly marketplace: Marketplace;
  readonly checking: boolean;
  readonly startFailed: boolean;
  readonly now: number;
  readonly formatClock: (timestamp: number) => string;
}

const CHECKING = "Checking…";
const FUTURE_TOLERANCE_MS = 60_000;
const FUTURE_WARNING =
  "This result is dated in the future, so the clock may have changed; press Check now.";
const SIGNED_IN: StatusPill = { text: "Signed in", tone: "in" };
const LAST_KNOWN: StatusPill = { text: "Last known", tone: "warn" };
const SIGNED_OUT: StatusPill = { text: "Not signed in", tone: "out" };
const VERIFICATION: StatusPill = { text: "Verification needed", tone: "warn" };

function withAge(base: string, input: ViewInput): string {
  const checkedAt = input.state?.checkedAt;
  return checkedAt === undefined
    ? base
    : `${base} Showing the result from ${formatAge(checkedAt, input.now)}.`;
}

function rateLimitedText(input: ViewInput): string {
  const base =
    input.throttle === undefined
      ? "Amazon asked for verification."
      : `Amazon asked for verification. Automatic checks resume after ${input.formatClock(input.throttle.nextAllowedAt)}.`;
  return withAge(base, input);
}

function challengeText(input: ViewInput): string {
  const advice = `Amazon asked for verification. Open ${input.marketplace.label} in a tab once, then press Check now`;
  const base =
    input.throttle === undefined
      ? `${advice}.`
      : `${advice} (automatic checks resume after ${input.formatClock(input.throttle.nextAllowedAt)}).`;
  return withAge(base, input);
}

function unreachableText(input: ViewInput): string {
  const checkedAt = input.state?.checkedAt;
  return checkedAt === undefined
    ? "Couldn't reach Amazon."
    : `Couldn't reach Amazon. Showing the result from ${formatAge(checkedAt, input.now)}.`;
}

function reasonText(reason: Reason, input: ViewInput): string {
  switch (reason) {
    case "challenge":
      return challengeText(input);
    case "rateLimited":
      return rateLimitedText(input);
    case "network":
    case "timeout":
    case "server":
      return unreachableText(input);
    case "sessionMismatch":
      return "Couldn't confirm the session. If you block third-party cookies, that can stop the check.";
    case "parse":
      return "Couldn't read Amazon's answer.";
  }
}

type Head = Pick<StatusView, "headline" | "email">;

function signedInHead(state: AccountState): Head {
  return state.email === undefined
    ? { headline: "Signed in — this account has no email address", email: null }
    : { headline: "Signed in", email: state.email };
}

function unconfirmedHeadline(input: ViewInput): string {
  if (input.startFailed) {
    return "Couldn't start the check";
  }
  const error = input.state?.lastError;
  if (error !== undefined && !input.checking) {
    return reasonText(error.reason, input);
  }
  if (input.checking) {
    return CHECKING;
  }
  return isThrottled(input.throttle, input.now)
    ? reasonText("challenge", input)
    : "Not checked yet — press Check now.";
}

function headlineOf(input: ViewInput): Head {
  const { state } = input;
  if (state?.status === "signedIn") {
    return signedInHead(state);
  }
  if (state?.status === "signedOut") {
    return {
      headline: `No account is signed in on ${input.marketplace.label} in this browser.`,
      email: null,
    };
  }
  return { headline: unconfirmedHeadline(input), email: null };
}

function detailOf(input: ViewInput): string | null {
  const { state } = input;
  if (state === undefined || state.status === "unknown") {
    return null;
  }
  if (input.startFailed) {
    return "Couldn't start the check";
  }
  if (input.checking) {
    return CHECKING;
  }
  if (state.lastError !== undefined) {
    return reasonText(state.lastError.reason, input);
  }
  return state.checkedAt === undefined
    ? null
    : `Checked ${formatAge(state.checkedAt, input.now)}, at ${input.formatClock(state.checkedAt)}`;
}

function throttledWithoutResult(input: ViewInput): boolean {
  const status = input.state?.status;
  return status !== "signedIn" && status !== "signedOut" && isThrottled(input.throttle, input.now);
}

function showsChallenge(input: ViewInput): boolean {
  if (input.startFailed || input.checking) {
    return false;
  }
  const error = input.state?.lastError;
  return error === undefined ? throttledWithoutResult(input) : error.reason === "challenge";
}

function linkOf(input: ViewInput): StatusLink | null {
  if (showsChallenge(input)) {
    return { text: `Open ${input.marketplace.label}`, href: `${originOf(input.marketplace)}/` };
  }
  return input.state?.status === "signedOut"
    ? { text: `Sign in on ${input.marketplace.label}`, href: buildSigninUrl(input.marketplace) }
    : null;
}

function staleWarningOf(input: ViewInput): string | null {
  const checkedAt = input.state?.checkedAt;
  if (checkedAt === undefined) {
    return null;
  }
  if (checkedAt - input.now > FUTURE_TOLERANCE_MS) {
    return FUTURE_WARNING;
  }
  return isStale(input.state, input.now)
    ? `Checked ${formatAge(checkedAt, input.now)}. This may be out of date; press Check now.`
    : null;
}

function pillOf(input: ViewInput, staleWarning: string | null): StatusPill | null {
  const status = input.state?.status;
  if (status === "signedIn") {
    return input.state?.lastError === undefined && staleWarning === null ? SIGNED_IN : LAST_KNOWN;
  }
  if (status === "signedOut") {
    return SIGNED_OUT;
  }
  return showsChallenge(input) ? VERIFICATION : null;
}

export function describeStatus(input: ViewInput): StatusView {
  const staleWarning = staleWarningOf(input);
  return {
    ...headlineOf(input),
    detail: detailOf(input),
    pill: pillOf(input, staleWarning),
    staleWarning,
    link: linkOf(input),
  };
}
