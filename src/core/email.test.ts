import { describe, expect, it } from "vitest";
import { decodeEntities, parseEmail } from "./email";

describe("parseEmail", () => {
  it("accepts a plain address from the ap-claim value", () => {
    expect(parseEmail("test.user@example.com")).toBe("test.user@example.com");
  });

  it("decodes HTML entities first, because Amazon may encode a + alias or the @", () => {
    expect(parseEmail("test.user&#43;shop&#64;example.com")).toBe("test.user+shop@example.com");
    expect(parseEmail("a&amp;b@example.com")).toBe("a&b@example.com");
  });

  it("accepts a non-ASCII local part, which is a valid address", () => {
    expect(parseEmail("jörg@example.com")).toBe("jörg@example.com");
  });

  it("returns null for a phone number, so a phone-only account never stores the number", () => {
    expect(parseEmail("+359888123456")).toBeNull();
  });

  it("returns null for a masked value, so a partly hidden address is never shown as the email", () => {
    expect(parseEmail("t***@example.com")).toBeNull();
  });

  it("returns null for an address longer than 254 characters", () => {
    expect(parseEmail(`${"a".repeat(64)}@${"b".repeat(190)}.com`)).toBeNull();
  });

  it("returns null for markup that slipped into the value", () => {
    expect(parseEmail('x@example.com"><script>')).toBeNull();
    expect(parseEmail("")).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("decodes once, so a double-encoded entity stays literal", () => {
    expect(decodeEntities("&amp;#64;")).toBe("&#64;");
  });

  it("drops code points outside Unicode instead of throwing", () => {
    expect(decodeEntities("a&#9999999;b")).toBe("ab");
  });
});
