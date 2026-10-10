import { isThrottled } from "./backoff";
import type { AccountState, ThrottleEntry } from "./state";

const FRESH_FOR_MS = 60_000;

const STALE_AFTER_MS = 86_400_000;

export function formatShortAge(checkedAt: number, now: number): string {
  const minutes = Math.floor((now - checkedAt) / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${String(hours)} h` : `${String(Math.floor(hours / 24))} d`;
}

export function formatAge(checkedAt: number, now: number): string {
  const short = formatShortAge(checkedAt, now);
  return short === "now" ? "just now" : `${short} ago`;
}

export function isStale(state: AccountState | undefined, now: number): boolean {
  return (
    state?.checkedAt !== undefined &&
    state.lastError === undefined &&
    now - state.checkedAt > STALE_AFTER_MS
  );
}

export function needsCheck(
  state: AccountState | undefined,
  throttle: ThrottleEntry | undefined,
  now: number,
): boolean {
  if (isThrottled(throttle, now)) {
    return false;
  }
  if (state?.checkedAt === undefined || state.lastError !== undefined) {
    return true;
  }
  const age = now - state.checkedAt;
  return age < 0 || age >= FRESH_FOR_MS;
}
