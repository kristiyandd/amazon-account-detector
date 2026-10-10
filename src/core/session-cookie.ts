import { marketplaceForCookieDomain } from "./marketplaces";
import type { MarketplaceId } from "./marketplaces";

export const DEFAULT_STORE_ID = "0";
const SESSION_COOKIE_NAME = /^at-(?:main|acb[a-z]{2})$/u;

export interface CookieIdentity {
  readonly name: string;
  readonly domain: string;
  readonly storeId: string;
  readonly partitionKey?: unknown;
}

export interface CookieChange {
  readonly removed: boolean;
  readonly cause: string;
  readonly cookie: CookieIdentity;
}

export type CookieSignal =
  | { readonly kind: "ignore" }
  | { readonly kind: "signedIn" | "signedOut"; readonly marketplace: MarketplaceId };

const IGNORE: CookieSignal = { kind: "ignore" };

export function isSessionCookie(cookie: CookieIdentity): boolean {
  return (
    cookie.storeId === DEFAULT_STORE_ID &&
    cookie.partitionKey === undefined &&
    SESSION_COOKIE_NAME.test(cookie.name)
  );
}

export function toCookieSignal(change: CookieChange): CookieSignal {
  const marketplace = marketplaceForCookieDomain(change.cookie.domain);
  if (marketplace === undefined || !isSessionCookie(change.cookie)) {
    return IGNORE;
  }
  if (!change.removed) {
    return { kind: "signedIn", marketplace };
  }
  return change.cause === "overwrite" ? IGNORE : { kind: "signedOut", marketplace };
}
