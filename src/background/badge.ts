import { badgeFor } from "@/core/badge";
import type { Badge } from "@/core/badge";
import { matchStatus } from "@/core/expected";
import { logError } from "@/core/log";
import { MARKETPLACES } from "@/core/marketplaces";
import {
  ACCOUNTS_KEY,
  AccountsSchema,
  DEFAULT_PREFS,
  EMPTY_ACCOUNTS,
  EMPTY_EXPECTED,
  EXPECTED_KEY,
  ExpectedSchema,
  parseOr,
  PREFS_KEY,
  PrefsSchema,
} from "@/core/state";
import type { StorageAreaLike } from "./store";

export interface BadgeAction {
  setBadgeText(details: { text: string }): Promise<void>;
  setBadgeBackgroundColor(details: { color: string }): Promise<void>;
}

interface BadgeDeps {
  readonly session: StorageAreaLike;
  readonly local: StorageAreaLike;
  readonly action: BadgeAction;
}

export interface BadgeUpdater {
  readonly refresh: () => Promise<void>;
  readonly onChanged: (keys: readonly string[]) => Promise<void>;
}

const INPUT_KEYS: ReadonlySet<string> = new Set([ACCOUNTS_KEY, EXPECTED_KEY, PREFS_KEY]);

async function computeBadge(deps: BadgeDeps): Promise<Badge> {
  const [session, local] = await Promise.all([
    deps.session.get([ACCOUNTS_KEY]),
    deps.local.get([EXPECTED_KEY, PREFS_KEY]),
  ]);
  const accounts = parseOr(AccountsSchema, session[ACCOUNTS_KEY], EMPTY_ACCOUNTS);
  const expected = parseOr(ExpectedSchema, local[EXPECTED_KEY], EMPTY_EXPECTED);
  const { selected } = parseOr(PrefsSchema, local[PREFS_KEY], DEFAULT_PREFS);
  const state = accounts.byMarketplace[selected];
  const match = matchStatus(state, expected.byMarketplace[selected]);
  return badgeFor(MARKETPLACES[selected], state, match);
}

export function createBadgeUpdater(deps: BadgeDeps): BadgeUpdater {
  let applied: Badge | null = null;
  let tail: Promise<void> = Promise.resolve();

  const apply = async (): Promise<void> => {
    try {
      const badge = await computeBadge(deps);
      if (applied?.text === badge.text && applied.color === badge.color) {
        return;
      }
      await Promise.all([
        deps.action.setBadgeText({ text: badge.text }),
        deps.action.setBadgeBackgroundColor({ color: badge.color }),
      ]);
      applied = badge;
    } catch (error: unknown) {
      applied = null;
      logError("Updating the toolbar badge failed", error);
    }
  };

  const afterPrevious = async (previous: Promise<void>): Promise<void> => {
    await previous;
    await apply();
  };

  const refresh = (): Promise<void> => {
    tail = afterPrevious(tail);
    return tail;
  };

  return {
    refresh,
    onChanged: (keys) => (keys.some((key) => INPUT_KEYS.has(key)) ? refresh() : Promise.resolve()),
  };
}
