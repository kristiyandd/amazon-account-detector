export const MARKETPLACE_IDS = ["us", "uk", "de", "it", "fr"] as const;

export type MarketplaceId = (typeof MARKETPLACE_IDS)[number];

export interface Marketplace {
  readonly id: MarketplaceId;
  readonly code: string;
  readonly label: string;
  readonly country: string;
  readonly tld: string;
  readonly assocHandle: string;
}

export const MARKETPLACES: Readonly<Record<MarketplaceId, Marketplace>> = {
  us: {
    id: "us",
    code: "US",
    label: "Amazon.com",
    country: "United States",
    tld: "com",
    assocHandle: "usflex",
  },
  uk: {
    id: "uk",
    code: "UK",
    label: "Amazon.co.uk",
    country: "United Kingdom",
    tld: "co.uk",
    assocHandle: "gbflex",
  },
  de: {
    id: "de",
    code: "DE",
    label: "Amazon.de",
    country: "Germany",
    tld: "de",
    assocHandle: "deflex",
  },
  it: {
    id: "it",
    code: "IT",
    label: "Amazon.it",
    country: "Italy",
    tld: "it",
    assocHandle: "itflex",
  },
  fr: {
    id: "fr",
    code: "FR",
    label: "Amazon.fr",
    country: "France",
    tld: "fr",
    assocHandle: "frflex",
  },
};

export function originOf(marketplace: Marketplace): string {
  return `https://www.amazon.${marketplace.tld}`;
}

function hostOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.hostname : undefined;
  } catch (_err) {
    return undefined;
  }
}

export function marketplaceForUrl(url: string | undefined): MarketplaceId | undefined {
  const host = url === undefined ? undefined : hostOf(url);
  if (host === undefined) {
    return undefined;
  }
  return MARKETPLACE_IDS.find((id) => {
    const site = `amazon.${MARKETPLACES[id].tld}`;
    return host === site || host.endsWith(`.${site}`);
  });
}

export function marketplaceForCookieDomain(domain: string): MarketplaceId | undefined {
  const host = domain.replace(/^\./u, "").replace(/^www\./u, "");
  return MARKETPLACE_IDS.find((id) => host === `amazon.${MARKETPLACES[id].tld}`);
}
