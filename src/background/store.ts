import { NO_THROTTLE } from "@/core/backoff";
import { logWarn } from "@/core/log";
import type { MarketplaceId } from "@/core/marketplaces";
import { sameState } from "@/core/reduce";
import {
  ACCOUNTS_KEY,
  AccountsSchema,
  EMPTY_ACCOUNTS,
  EMPTY_THROTTLE,
  parseOr,
  THROTTLE_KEY,
  ThrottleSchema,
} from "@/core/state";
import type { Accounts, AccountState, Throttle, ThrottleEntry } from "@/core/state";

export interface StorageAreaLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

type AccountUpdate = (previous: AccountState | undefined) => AccountState | null;
type ThrottleUpdate = (previous: ThrottleEntry | undefined) => ThrottleEntry;

export interface Store {
  readonly readAccount: (id: MarketplaceId) => Promise<AccountState | undefined>;
  readonly updateAccount: (id: MarketplaceId, update: AccountUpdate) => Promise<boolean>;
  readonly readThrottle: (id: MarketplaceId) => Promise<ThrottleEntry | undefined>;
  readonly updateThrottle: (id: MarketplaceId, update: ThrottleUpdate) => Promise<boolean>;
}

async function readAccounts(area: StorageAreaLike): Promise<Accounts> {
  const items = await area.get([ACCOUNTS_KEY]);
  return parseOr(AccountsSchema, items[ACCOUNTS_KEY], EMPTY_ACCOUNTS);
}

async function readThrottles(area: StorageAreaLike): Promise<Throttle> {
  const items = await area.get([THROTTLE_KEY]);
  return parseOr(ThrottleSchema, items[THROTTLE_KEY], EMPTY_THROTTLE);
}

async function afterPrevious(
  previous: Promise<unknown>,
  task: () => Promise<boolean>,
): Promise<boolean> {
  try {
    await previous;
  } catch (_err) {
    logWarn("An earlier storage update failed; continuing with the next one");
  }
  return task();
}

function sameThrottle(a: ThrottleEntry, b: ThrottleEntry): boolean {
  return (
    a.failures === b.failures &&
    a.nextAllowedAt === b.nextAllowedAt &&
    a.lastManualAt === b.lastManualAt
  );
}

export function createStore(session: StorageAreaLike, local: StorageAreaLike): Store {
  let tail: Promise<unknown> = Promise.resolve();
  const serialized = (task: () => Promise<boolean>): Promise<boolean> => {
    const run = afterPrevious(tail, task);
    tail = run;
    return run;
  };
  return {
    readAccount: async (id) => (await readAccounts(session)).byMarketplace[id],
    updateAccount: (id, update) =>
      serialized(async () => {
        const accounts = await readAccounts(session);
        const previous = accounts.byMarketplace[id];
        const next = update(previous);
        if (next === null || sameState(previous, next)) {
          return false;
        }
        await session.set({
          [ACCOUNTS_KEY]: { ...accounts, byMarketplace: { ...accounts.byMarketplace, [id]: next } },
        });
        return true;
      }),
    readThrottle: async (id) => (await readThrottles(local)).byMarketplace[id],
    updateThrottle: (id, update) =>
      serialized(async () => {
        const throttle = await readThrottles(local);
        const previous = throttle.byMarketplace[id] ?? NO_THROTTLE;
        const next = update(throttle.byMarketplace[id]);
        if (sameThrottle(previous, next)) {
          return false;
        }
        await local.set({
          [THROTTLE_KEY]: { ...throttle, byMarketplace: { ...throttle.byMarketplace, [id]: next } },
        });
        return true;
      }),
  };
}
