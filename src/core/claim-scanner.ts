const CLAIM_IDS = ['id="ap-claim"', "id='ap-claim'"] as const;
const SIGN_IN_MARKERS = ['id="ap_email', "id='ap_email"] as const;
const CHALLENGE_MARKERS = [
  "validateCaptcha",
  "captchacharacters",
  "gokuProps",
  "awsWafCookieDomainList",
] as const;
const VALUE_DOUBLE = /\svalue="([^"]{0,1024})"/u;
const VALUE_SINGLE = /\svalue='([^']{0,1024})'/u;
const MAX_TAG_LENGTH = 1024;
const TAIL_LENGTH = 2048;

export interface ScanResult {
  readonly claim: string | null;
  readonly sawSignInForm: boolean;
  readonly sawChallenge: boolean;
}

export interface ClaimScanner {
  readonly push: (chunk: string) => void;
  readonly result: () => ScanResult;
}

function firstIndexOf(text: string, needles: readonly string[]): number {
  const found = needles.map((needle) => text.indexOf(needle)).filter((index) => index >= 0);
  return found.length === 0 ? -1 : Math.min(...found);
}

function findClaimTag(buffer: string): string | null {
  const at = firstIndexOf(buffer, CLAIM_IDS);
  if (at < 0) {
    return null;
  }
  const start = buffer.lastIndexOf("<", at);
  const end = buffer.indexOf(">", at);
  if (start < 0 || end < 0 || end + 1 - start > MAX_TAG_LENGTH) {
    return null;
  }
  return buffer.slice(start, end + 1);
}

function valueOf(tag: string): string {
  return (VALUE_DOUBLE.exec(tag) ?? VALUE_SINGLE.exec(tag))?.[1] ?? "";
}

export function createClaimScanner(): ClaimScanner {
  let tail = "";
  let claim: string | null = null;
  let sawSignInForm = false;
  let sawChallenge = false;
  return {
    push: (chunk: string): void => {
      if (claim !== null) {
        return;
      }
      const buffer = tail + chunk;
      sawSignInForm ||= firstIndexOf(buffer, SIGN_IN_MARKERS) >= 0;
      sawChallenge ||= firstIndexOf(buffer, CHALLENGE_MARKERS) >= 0;
      const tag = findClaimTag(buffer);
      if (tag !== null) {
        claim = valueOf(tag);
      }
      tail = buffer.slice(-TAIL_LENGTH);
    },
    result: (): ScanResult => ({ claim, sawSignInForm, sawChallenge }),
  };
}

export function scanAll(chunks: readonly string[]): ScanResult {
  const scanner = createClaimScanner();
  for (const chunk of chunks) {
    scanner.push(chunk);
  }
  return scanner.result();
}
