import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EMAIL = /[^\s"'(),:;<>@[\\\]]{1,64}@(?:[\w-]+\.)+[a-z]{2,}\b/giu;
const DISPLAY_NAME = /(auth-text-truncate">)[^<@]{1,80}(<\/div>)/gu;
const TOKENS =
  /(name=["'](?:anti-csrftoken-a2z|appActionToken|metadata1|workflowState|openid\.return_to)["'][^>]{0,40}value=["'])[^"']*/gu;
const SESSION_ID = /\b\d{3}-\d{7}-\d{7}\b/gu;
const CUSTOMER_ID = /\bA[\dA-Z]{12,13}\b/gu;
const ID_FIELDS = /("(?:customerId|sessionId|obfuscatedCustomerId)"\s*:\s*")[^"]*/gu;

export const FIXTURES: readonly (readonly [string, string])[] = [
  ["2026-10-10-signed-in/signedin-com-usflex.html", "signed-in-us.html"],
  ["2026-10-10-signed-in/signedout-after-logout-com-usflex.html", "signed-out-us.html"],
  ["2026-10-10-signed-in/com-account-on-de-200.html", "signed-out-de.html"],
  ["2026-10-10-signed-in/com-account-on-it-200.html", "signed-out-it.html"],
  ["2026-10-10-signed-out/signedout-co_uk-gbflex.html", "signed-out-uk.html"],
  ["2026-10-10-signed-out/signedout-fr-frflex.html", "signed-out-fr.html"],
  ["2026-10-10-signed-out/signedout-co_uk-usflex.html", "waf-challenge-uk.html"],
  ["2026-10-10-signed-out/signedout-de-usflex.html", "not-found-de.html"],
];

export function scrub(html: string): string {
  return html
    .replace(EMAIL, "test.user@example.com")
    .replace(DISPLAY_NAME, "$1Test User$2")
    .replace(TOKENS, "$1REDACTED")
    .replace(SESSION_ID, "000-0000000-0000000")
    .replace(CUSTOMER_ID, "A0000000000000")
    .replace(ID_FIELDS, "$1REDACTED");
}

if (import.meta.main) {
  const root = process.cwd();
  const target = path.join(root, "src", "test", "fixtures");
  mkdirSync(target, { recursive: true });
  for (const [source, name] of FIXTURES) {
    const html = readFileSync(path.join(root, ".captures", source), "utf8");
    writeFileSync(path.join(target, name), scrub(html));
    console.warn(`fixture written: ${name}`);
  }
}
