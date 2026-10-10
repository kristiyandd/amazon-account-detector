import type { MatchStatus } from "./expected";
import type { Marketplace } from "./marketplaces";
import type { AccountState } from "./state";

export interface Badge {
  readonly text: string;
  readonly color: string;
}

const RED = "#b42318";
const GREEN = "#11795a";
const GREY = "#5f6878";
const ORANGE = "#a14a06";

function asksToWait(state: AccountState | undefined): boolean {
  const reason = state?.lastError?.reason;
  return reason === "challenge" || reason === "rateLimited";
}

function statusColor(state: AccountState | undefined): string | null {
  switch (state?.status) {
    case "signedIn":
      return GREEN;
    case "signedOut":
      return GREY;
    case "unknown":
    case undefined:
      return null;
  }
}

export function badgeFor(
  marketplace: Marketplace,
  state: AccountState | undefined,
  match: MatchStatus,
): Badge {
  if (match === "mismatch" || match === "missing") {
    return { text: "!", color: RED };
  }
  if (asksToWait(state)) {
    return { text: marketplace.code, color: ORANGE };
  }
  const color = match === "unknown" ? null : statusColor(state);
  return color === null ? { text: "", color: GREY } : { text: marketplace.code, color };
}
