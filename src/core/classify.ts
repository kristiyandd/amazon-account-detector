import { parseEmail } from "./email";
import { originOf } from "./marketplaces";
import type { ScanResult } from "./claim-scanner";
import type { Marketplace } from "./marketplaces";
import type { Outcome, Reason } from "./state";

export interface PageSummary {
  readonly status: number;
  readonly finalUrl: string;
  readonly scan: ScanResult;
  readonly truncated: boolean;
}

function failed(reason: Reason): Outcome {
  return { kind: "failed", reason };
}

function byStatus(status: number): Outcome | null {
  if (status === 202 || status === 503) {
    return failed("challenge");
  }
  if (status === 429) {
    return failed("rateLimited");
  }
  return status >= 500 ? failed("server") : null;
}

function isOwnOrigin(finalUrl: string, marketplace: Marketplace): boolean {
  return URL.canParse(finalUrl) && new URL(finalUrl).origin === originOf(marketplace);
}

export function classifyPage(page: PageSummary, marketplace: Marketplace): Outcome {
  const statusOutcome = byStatus(page.status);
  if (statusOutcome !== null) {
    return statusOutcome;
  }
  if (!isOwnOrigin(page.finalUrl, marketplace)) {
    return failed("parse");
  }
  if (page.scan.claim !== null) {
    return { kind: "signedIn", email: parseEmail(page.scan.claim) };
  }
  if (page.scan.sawChallenge) {
    return failed("challenge");
  }
  const signedOut = page.status === 200 && page.scan.sawSignInForm && !page.truncated;
  return signedOut ? { kind: "signedOut" } : failed("parse");
}

export function crossCheck(outcome: Outcome, hasSessionCookie: boolean): Outcome {
  if (outcome.kind === "failed") {
    return outcome;
  }
  return (outcome.kind === "signedIn") === hasSessionCookie ? outcome : failed("sessionMismatch");
}
