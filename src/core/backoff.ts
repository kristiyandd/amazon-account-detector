import type { Outcome, ThrottleEntry } from "./state";

const CHALLENGE_BASE_MS = 1_800_000;
export const CHALLENGE_CAP_MS = 21_600_000;
const RETRY_BASE_MS = 1000;
const MANUAL_COOLDOWN_MS = 30_000;
const RESET: ThrottleEntry = { failures: 0, nextAllowedAt: 0 };

export interface ThrottleContext {
  readonly now: number;
  readonly random: () => number;
  readonly retryAfterMs: number | null;
}

export function challengeDelay(failures: number, random: () => number): number {
  const ceiling = Math.min(CHALLENGE_CAP_MS, CHALLENGE_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

export function retryDelay(retry: number, random: () => number): number {
  return Math.round(random() * RETRY_BASE_MS * 2 ** retry);
}

export function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null) {
    return null;
  }
  const trimmed = header.trim();
  if (/^\d{1,9}$/u.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function nextThrottle(
  entry: ThrottleEntry | undefined,
  outcome: Outcome,
  context: ThrottleContext,
): ThrottleEntry {
  const current = entry ?? RESET;
  if (outcome.kind !== "failed") {
    return { ...current, ...RESET };
  }
  if (outcome.reason !== "challenge" && outcome.reason !== "rateLimited") {
    return current;
  }
  const failures = current.failures + 1;
  const wait = Math.min(
    CHALLENGE_CAP_MS,
    Math.max(challengeDelay(failures, context.random), context.retryAfterMs ?? 0),
  );
  return { ...current, failures, nextAllowedAt: context.now + wait };
}

export function isThrottled(entry: ThrottleEntry | undefined, now: number): boolean {
  if (entry === undefined) {
    return false;
  }
  const wait = entry.nextAllowedAt - now;
  return wait > 0 && wait <= CHALLENGE_CAP_MS;
}

export function manualCooldownLeft(entry: ThrottleEntry | undefined, now: number): number {
  const elapsed = now - (entry?.lastManualAt ?? Number.NEGATIVE_INFINITY);
  return elapsed >= 0 && elapsed < MANUAL_COOLDOWN_MS ? MANUAL_COOLDOWN_MS - elapsed : 0;
}
