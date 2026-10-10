import { matchStatus } from "@/core/expected";
import type { MatchStatus } from "@/core/expected";
import { MARKETPLACE_IDS, MARKETPLACES } from "@/core/marketplaces";
import type { Marketplace, MarketplaceId } from "@/core/marketplaces";
import { describeMarketplace } from "@/core/overview";
import type { MarketplaceOverview } from "@/core/overview";
import type { ExpectedEntry } from "@/core/state";
import type { Snapshot } from "./api";

export interface MarketplaceEntry {
  readonly id: MarketplaceId;
  readonly marketplace: Marketplace;
  readonly match: MatchStatus;
  readonly expected: ExpectedEntry | undefined;
  readonly overview: MarketplaceOverview;
}

export function buildEntries(snapshot: Snapshot | null, now: number): readonly MarketplaceEntry[] {
  return MARKETPLACE_IDS.map((id) => {
    const state = snapshot?.accounts.byMarketplace[id];
    const expected = snapshot?.expected.byMarketplace[id];
    const match = matchStatus(state, expected);
    const marketplace = MARKETPLACES[id];
    const throttle = snapshot?.throttle.byMarketplace[id];
    const overview = describeMarketplace({ marketplace, state, throttle, match, now });
    return { id, marketplace, match, expected, overview };
  });
}
