import {
  isThrottled,
  manualCooldownLeft,
  nextThrottle,
  parseRetryAfter,
  retryDelay,
} from "@/core/backoff";
import { classifyPage, crossCheck } from "@/core/classify";
import { hashEmail } from "@/core/expected";
import type { Digester } from "@/core/expected";
import { isDebugLogging, logDebug, logWarn } from "@/core/log";
import { MARKETPLACES } from "@/core/marketplaces";
import type { Marketplace, MarketplaceId } from "@/core/marketplaces";
import { nextState, withEmailHash } from "@/core/reduce";
import { buildSigninUrl } from "@/core/signin-url";
import type { Outcome, ThrottleEntry } from "@/core/state";
import { fetchPage } from "./fetch-page";
import type { FetchFn } from "./fetch-page";
import type { Store } from "./store";

export type RunCheck = (id: MarketplaceId, manual: boolean) => Promise<void>;

const ATTEMPT_TIMEOUT_MS = 15_000;
const CHECK_DEADLINE_MS = 25_000;
const MAX_RETRIES = 2;

export interface CheckDeps {
  readonly fetch: FetchFn;
  readonly store: Store;
  readonly hasSessionCookie: (marketplace: Marketplace) => Promise<boolean>;
  readonly now: () => number;
  readonly random: () => number;
  readonly timeout: (ms: number) => AbortSignal;
  readonly sleep: (ms: number) => Promise<void>;
  readonly subtle: Digester;
}

interface Attempt {
  readonly outcome: Outcome;
  readonly retryAfter: string | null;
  readonly trace: string;
}

interface CheckResult extends Omit<Attempt, "trace"> {
  readonly startGeneration: number;
  readonly emailHash: string | null;
}

async function attemptOnce(
  marketplace: Marketplace,
  deps: CheckDeps,
  deadline: AbortSignal,
): Promise<Attempt> {
  const signal = AbortSignal.any([deps.timeout(ATTEMPT_TIMEOUT_MS), deadline]);
  const result = await fetchPage(buildSigninUrl(marketplace), deps.fetch, signal);
  return result.ok
    ? {
        outcome: classifyPage(result.page, marketplace),
        retryAfter: result.page.retryAfter,
        trace: `${String(result.page.status)} ${String(result.page.bytes)}`,
      }
    : {
        outcome: { kind: "failed", reason: result.reason },
        retryAfter: null,
        trace: result.reason,
      };
}

function describeOutcome(outcome: Outcome): string {
  return outcome.kind === "failed" ? `failed/${outcome.reason}` : outcome.kind;
}

function isRetryable(outcome: Outcome): boolean {
  return outcome.kind === "failed" && (outcome.reason === "network" || outcome.reason === "server");
}

async function fetchWithRetries(marketplace: Marketplace, deps: CheckDeps): Promise<Attempt> {
  const deadline = deps.timeout(CHECK_DEADLINE_MS);
  const timed = async (number: number): Promise<Attempt> => {
    const started = deps.now();
    const result = await attemptOnce(marketplace, deps, deadline);
    const elapsed = deps.now() - started;
    logDebug(
      `check ${marketplace.id}: attempt ${String(number)} → ${result.trace} ${String(elapsed)} ms`,
    );
    return result;
  };
  let attempt = await timed(1);
  for (let retry = 0; retry < MAX_RETRIES && isRetryable(attempt.outcome); retry += 1) {
    const delay = retryDelay(retry, deps.random);
    logDebug(`check ${marketplace.id}: retry ${String(retry + 1)} in ${String(delay)} ms`);
    await deps.sleep(delay);
    if (deadline.aborted) {
      break;
    }
    attempt = await timed(retry + 2);
  }
  return attempt;
}

async function sessionCookieExists(
  marketplace: Marketplace,
  deps: CheckDeps,
): Promise<boolean | null> {
  try {
    return await deps.hasSessionCookie(marketplace);
  } catch (_err) {
    return null;
  }
}

async function settle(
  marketplace: Marketplace,
  attempt: Attempt,
  deps: CheckDeps,
): Promise<Outcome> {
  if (attempt.outcome.kind === "failed") {
    return attempt.outcome;
  }
  const hasCookie = await sessionCookieExists(marketplace, deps);
  const settled: Outcome =
    hasCookie === null
      ? { kind: "failed", reason: "sessionMismatch" }
      : crossCheck(attempt.outcome, hasCookie);
  logDebug(
    `check ${marketplace.id}: cookie present=${String(hasCookie ?? "unknown")} → ${describeOutcome(settled)}`,
  );
  return settled;
}

async function record(id: MarketplaceId, result: CheckResult, deps: CheckDeps): Promise<void> {
  const now = deps.now();
  const retryAfterMs = parseRetryAfter(result.retryAfter, now);
  let status = "";
  const wrote = await deps.store.updateAccount(id, (previous) => {
    if ((previous?.generation ?? 0) !== result.startGeneration) {
      logDebug(`check ${id}: result dropped (generation changed)`);
      return null;
    }
    const next = withEmailHash(nextState(previous, result.outcome, now), result.emailHash);
    status = next.status;
    return next;
  });
  if (status !== "") {
    logDebug(wrote ? `check ${id}: wrote ${status}` : `check ${id}: unchanged`);
  }
  let throttled: ThrottleEntry | undefined;
  const changed = await deps.store.updateThrottle(id, (previous) => {
    throttled = nextThrottle(previous, result.outcome, {
      now,
      random: deps.random,
      retryAfterMs,
    });
    return throttled;
  });
  if (changed && throttled !== undefined) {
    logDebug(
      `check ${id}: throttle failures=${String(throttled.failures)} next=${isoOf(throttled.nextAllowedAt)}`,
    );
  }
}

function isoOf(timestamp: number): string {
  return isDebugLogging() ? new Date(timestamp).toISOString() : "";
}

async function hashOf(outcome: Outcome, deps: CheckDeps): Promise<string | null> {
  if (outcome.kind !== "signedIn" || outcome.email === null) {
    return null;
  }
  try {
    return await hashEmail(outcome.email, deps.subtle);
  } catch (_err) {
    logWarn("Hashing the signed-in email failed; the expected-account match stays unknown");
    return null;
  }
}

async function manualSkipped(id: MarketplaceId, deps: CheckDeps): Promise<boolean> {
  const now = deps.now();
  const left = manualCooldownLeft(await deps.store.readThrottle(id), now);
  if (left > 0) {
    logDebug(`check ${id}: skipped (manual cooldown, ${String(left)} ms left)`);
    return true;
  }
  await deps.store.updateThrottle(id, (previous) => ({
    failures: previous?.failures ?? 0,
    nextAllowedAt: previous?.nextAllowedAt ?? 0,
    lastManualAt: now,
  }));
  return false;
}

async function isSkipped(id: MarketplaceId, manual: boolean, deps: CheckDeps): Promise<boolean> {
  if (manual) {
    return manualSkipped(id, deps);
  }
  const throttle = await deps.store.readThrottle(id);
  if (!isThrottled(throttle, deps.now())) {
    return false;
  }
  logDebug(`check ${id}: skipped (throttled until ${isoOf(throttle?.nextAllowedAt ?? 0)})`);
  return true;
}

export function createChecker(deps: CheckDeps): RunCheck {
  return async (id, manual) => {
    if (await isSkipped(id, manual, deps)) {
      return;
    }
    const marketplace = MARKETPLACES[id];
    const startGeneration = (await deps.store.readAccount(id))?.generation ?? 0;
    const attempt = await fetchWithRetries(marketplace, deps);
    logDebug(`check ${id}: classified ${describeOutcome(attempt.outcome)}`);
    const outcome = await settle(marketplace, attempt, deps);
    if (outcome.kind === "failed") {
      logWarn(`Check for ${id} ended with ${outcome.reason}`);
    }
    const emailHash = await hashOf(outcome, deps);
    await record(id, { outcome, retryAfter: attempt.retryAfter, startGeneration, emailHash }, deps);
  };
}
