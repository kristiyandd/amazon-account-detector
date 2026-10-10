import { describe, expect, it } from "vitest";
import { MARKETPLACE_IDS, MARKETPLACES } from "./marketplaces";
import { buildSigninUrl } from "./signin-url";

describe("buildSigninUrl", () => {
  it("is the brief's sign-in URL on the marketplace's own host with its own handle", () => {
    const url = new URL(buildSigninUrl(MARKETPLACES.de));
    expect(url.origin + url.pathname).toBe("https://www.amazon.de/ap/signin");
    expect(url.searchParams.get("openid.assoc_handle")).toBe("deflex");
    expect(url.searchParams.get("openid.pape.max_auth_age")).toBe("0");
    expect(url.searchParams.get("openid.return_to")).toBe(
      "https://www.amazon.de/?&ref_=nav_youraccount_switchacct",
    );
  });

  it("never points one marketplace's request at another marketplace's host", () => {
    for (const id of MARKETPLACE_IDS) {
      expect(new URL(buildSigninUrl(MARKETPLACES[id])).host).toBe(
        `www.amazon.${MARKETPLACES[id].tld}`,
      );
    }
  });
});
