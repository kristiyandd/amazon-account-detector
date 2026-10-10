import { parseEmail } from "@/core/email";
import type { Email } from "@/core/email";

export function testEmail(raw: string): Email {
  const email = parseEmail(raw);
  if (email === null) {
    throw new Error("fixture email must parse");
  }
  return email;
}

export const TEST_EMAIL_TEXT = "test.user@example.com";
export const TEST_EMAIL: Email = testEmail(TEST_EMAIL_TEXT);

export const ACCOUNT_HASH = "1a".repeat(32);
export const OTHER_HASH = "0f".repeat(32);
export const ACCOUNT_HINT = "t•••r@e•••.com";
export const OTHER_HINT = "o•••s@e•••.com";
export const STORED_HINT = "o•••s@example.com";
