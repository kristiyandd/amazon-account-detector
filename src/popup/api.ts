import * as v from "valibot";
import { watchDebugFlag } from "@/core/debug-flag";
import { withExpected } from "@/core/expected";
import { logDebug } from "@/core/log";
import { marketplaceForUrl } from "@/core/marketplaces";
import type { MarketplaceId } from "@/core/marketplaces";
import {
  ACCOUNTS_KEY,
  AccountsSchema,
  DEFAULT_PREFS,
  EMPTY_ACCOUNTS,
  EMPTY_EXPECTED,
  EMPTY_THROTTLE,
  EXPECTED_KEY,
  ExpectedSchema,
  parseOr,
  PREFS_KEY,
  PrefsSchema,
  ReplySchema,
  THROTTLE_KEY,
  ThrottleSchema,
} from "@/core/state";
import type {
  Accounts,
  CheckMessage,
  Expected,
  ExpectedEntry,
  Prefs,
  Throttle,
} from "@/core/state";

const RETRY_DELAY_MS = 500;

export interface Snapshot {
  readonly accounts: Accounts;
  readonly throttle: Throttle;
  readonly prefs: Prefs;
  readonly expected: Expected;
}

export async function readSnapshot(): Promise<Snapshot> {
  const [session, local] = await Promise.all([
    chrome.storage.session.get([ACCOUNTS_KEY]),
    chrome.storage.local.get([PREFS_KEY, THROTTLE_KEY, EXPECTED_KEY]),
  ]);
  return {
    accounts: parseOr(AccountsSchema, session[ACCOUNTS_KEY], EMPTY_ACCOUNTS),
    throttle: parseOr(ThrottleSchema, local[THROTTLE_KEY], EMPTY_THROTTLE),
    prefs: parseOr(PrefsSchema, local[PREFS_KEY], DEFAULT_PREFS),
    expected: parseOr(ExpectedSchema, local[EXPECTED_KEY], EMPTY_EXPECTED),
  };
}

export async function saveExpected(
  marketplace: MarketplaceId,
  entry: ExpectedEntry | null,
): Promise<void> {
  const items = await chrome.storage.local.get([EXPECTED_KEY]);
  const current = parseOr(ExpectedSchema, items[EXPECTED_KEY], EMPTY_EXPECTED);
  await chrome.storage.local.set({ [EXPECTED_KEY]: withExpected(current, marketplace, entry) });
}

export async function activeTabMarketplace(): Promise<MarketplaceId | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return marketplaceForUrl(tab?.url);
  } catch (_err) {
    return undefined;
  }
}

export async function savePrefs(selected: MarketplaceId): Promise<void> {
  const prefs: Prefs = { schemaVersion: 1, selected };
  await chrome.storage.local.set({ [PREFS_KEY]: prefs });
}

async function send(message: CheckMessage): Promise<boolean> {
  const reply: unknown = await chrome.runtime.sendMessage(message);
  return v.is(ReplySchema, reply) && reply.accepted;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestCheck(marketplace: MarketplaceId, manual: boolean): Promise<boolean> {
  const message: CheckMessage = { type: "check", marketplace, manual };
  try {
    return await send(message);
  } catch (_err) {
    logDebug(`popup: sendMessage failed, retry in ${String(RETRY_DELAY_MS)} ms`);
    await wait(RETRY_DELAY_MS);
    try {
      return await send(message);
    } catch (_retryErr) {
      return false;
    }
  }
}

export function subscribe(listener: () => void): () => void {
  const handler = (_changes: unknown, areaName: string): void => {
    if (areaName === "session" || areaName === "local") {
      listener();
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => {
    chrome.storage.onChanged.removeListener(handler);
  };
}

export function watchDebugLogging(): void {
  watchDebugFlag(chrome.storage.local, chrome.storage.onChanged);
}
