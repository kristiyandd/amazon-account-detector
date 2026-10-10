import { originOf } from "./marketplaces";
import type { Marketplace } from "./marketplaces";

const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";

export function buildSigninUrl(marketplace: Marketplace): string {
  const origin = originOf(marketplace);
  const params = new URLSearchParams({
    "openid.pape.max_auth_age": "0",
    "openid.return_to": `${origin}/?&ref_=nav_youraccount_switchacct`,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.assoc_handle": marketplace.assocHandle,
    "openid.mode": "checkid_setup",
    "openid.claimed_id": IDENTIFIER_SELECT,
    "openid.ns": "http://specs.openid.net/auth/2.0",
    ignoreAuthState: "1",
    _encoding: "UTF8",
  });
  return `${origin}/ap/signin?${params.toString()}`;
}
