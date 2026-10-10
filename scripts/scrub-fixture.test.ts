import { describe, expect, it } from "vitest";
import { scrub } from "./scrub-fixture.ts";

describe("scrub", () => {
  it("replaces every address with the example address so no real email is committed", () => {
    expect(scrub('<input value="someone@example.org"> support@example.org')).toBe(
      '<input value="test.user@example.com"> test.user@example.com',
    );
  });

  it("replaces the profile name shown above the claim", () => {
    expect(scrub('<div class="a-row auth-text-truncate">Jane Roe</div>')).toBe(
      '<div class="a-row auth-text-truncate">Test User</div>',
    );
  });

  it("blanks anti-CSRF and workflow tokens", () => {
    expect(
      scrub("<input type='hidden' name='anti-csrftoken-a2z' value='synthetic-token=' />"),
    ).toBe("<input type='hidden' name='anti-csrftoken-a2z' value='REDACTED' />");
  });

  it("zeroes session ids embedded in page scripts", () => {
    expect(scrub("ue_sid='123-4567890-1234567'")).toBe("ue_sid='000-0000000-0000000'");
  });

  it("replaces the whole local part of a non-ASCII address", () => {
    expect(scrub("jörg.müller@example.org")).toBe("test.user@example.com");
  });

  it("zeroes customer ids, whether bare or in a JSON field", () => {
    expect(scrub('cid=A1B2C3D4E5F6G7 {"customerId":"XYZ123"}')).toBe(
      'cid=A0000000000000 {"customerId":"REDACTED"}',
    );
  });

  it("is idempotent, so re-running it on a fixture changes nothing", () => {
    const once = scrub('<div class="auth-text-truncate">Jane</div> a@example.org');
    expect(scrub(once)).toBe(once);
  });
});
