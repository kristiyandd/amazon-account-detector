import { logDebug } from "@/core/log";
import type { MarketplaceId } from "@/core/marketplaces";
import { invalidatedByCookie, signedOutByCookie } from "@/core/reduce";
import { toCookieSignal } from "@/core/session-cookie";
import type { CookieChange, CookieSignal } from "@/core/session-cookie";
import type { Store } from "./store";

const DEBOUNCE_MS = 500;
const COOKIE_CHECK_INTERVAL_MS = 20_000;

interface WatcherDeps {
  readonly store: Store;
  readonly requestCheck: (id: MarketplaceId) => void;
  readonly now: () => number;
  readonly setTimer: (callback: () => void, ms: number) => void;
}

export interface SessionWatcher {
  readonly onChanged: (change: CookieChange) => Promise<void>;
}

function describeChange(
  change: CookieChange,
  signal: Exclude<CookieSignal, { readonly kind: "ignore" }>,
): string {
  const action = change.removed ? "removed" : "written";
  const verdict = `${signal.kind === "signedIn" ? "forget" : "signedOut"} ${signal.marketplace}`;
  return `cookie ${change.cookie.name} ${action} (${change.cause}) → ${verdict}`;
}

export function createSessionWatcher(deps: WatcherDeps): SessionWatcher {
  const pending = new Set<MarketplaceId>();
  const lastCookieCheckAt = new Map<MarketplaceId, number>();

  const scheduleCheck = (id: MarketplaceId): void => {
    if (pending.has(id)) {
      logDebug(`cookie: check ${id} already scheduled`);
      return;
    }
    const windowEnd =
      (lastCookieCheckAt.get(id) ?? Number.NEGATIVE_INFINITY) + COOKIE_CHECK_INTERVAL_MS;
    const delay = Math.max(DEBOUNCE_MS, windowEnd - deps.now());
    pending.add(id);
    logDebug(`cookie: check ${id} scheduled in ${String(delay)} ms`);
    deps.setTimer(() => {
      pending.delete(id);
      lastCookieCheckAt.set(id, deps.now());
      deps.requestCheck(id);
    }, delay);
  };

  return {
    onChanged: async (change) => {
      const signal = toCookieSignal(change);
      if (signal.kind !== "ignore") {
        logDebug(describeChange(change, signal));
      }
      if (signal.kind === "signedIn") {
        await deps.store.updateAccount(signal.marketplace, invalidatedByCookie);
        scheduleCheck(signal.marketplace);
      } else if (signal.kind === "signedOut") {
        await deps.store.updateAccount(signal.marketplace, (previous) =>
          signedOutByCookie(previous, deps.now()),
        );
      }
    },
  };
}
