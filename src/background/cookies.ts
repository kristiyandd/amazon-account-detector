import { originOf } from "@/core/marketplaces";
import type { Marketplace } from "@/core/marketplaces";
import { DEFAULT_STORE_ID, isSessionCookie } from "@/core/session-cookie";
import type { CookieIdentity } from "@/core/session-cookie";

export interface CookieReader {
  getAll(details: { url: string; storeId: string }): Promise<CookieIdentity[]>;
}

export async function hasSessionCookie(
  reader: CookieReader,
  marketplace: Marketplace,
): Promise<boolean> {
  const cookies = await reader.getAll({
    url: `${originOf(marketplace)}/`,
    storeId: DEFAULT_STORE_ID,
  });
  return cookies.some((cookie) => isSessionCookie(cookie));
}
