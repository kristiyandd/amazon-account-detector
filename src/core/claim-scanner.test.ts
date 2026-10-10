import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { scanAll } from "./claim-scanner";

const PAGE =
  '<div>x</div><input type="hidden" name="email" value="test.user@example.com" id="ap-claim"/><input id="ap_email" name="email">';

function splitAt(text: string, cuts: readonly number[]): string[] {
  const points = [...new Set(cuts.map((cut) => cut % (text.length + 1)))].toSorted((a, b) => a - b);
  return [...points, text.length].map((end, index) => text.slice(points[index - 1] ?? 0, end));
}

describe("claim scanner", () => {
  it("finds the claim value whatever the attribute order", () => {
    expect(scanAll([PAGE]).claim).toBe("test.user@example.com");
    expect(scanAll(["<input id='ap-claim' value='a@example.com'>"]).claim).toBe("a@example.com");
  });

  it("finds the claim when the tag is split across chunks, as a streamed body may be", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 8 }), (cuts) => {
        expect(scanAll(splitAt(PAGE, cuts)).claim).toBe("test.user@example.com");
      }),
    );
  });

  it("reports a sign-in form and no claim on a signed-out page", () => {
    expect(scanAll(['<form><input type="email" id="ap_email_login" name="email"></form>'])).toEqual(
      {
        claim: null,
        sawSignInForm: true,
        sawChallenge: false,
      },
    );
  });

  it("reports challenge markers from captcha and WAF pages", () => {
    expect(scanAll(["<script>window.gokuProps = {}</script>"]).sawChallenge).toBe(true);
    expect(scanAll(['<input id="captchacharacters">']).sawChallenge).toBe(true);
  });

  it("ignores a claim tag longer than 1 KiB instead of scanning it", () => {
    expect(
      scanAll([`<input id="ap-claim" data-x="${"y".repeat(1100)}" value="a@example.com">`]).claim,
    ).toBeNull();
  });

  it("returns an empty claim for a claim tag without a value", () => {
    expect(scanAll(['<input id="ap-claim">']).claim).toBe("");
  });

  it("never throws on arbitrary text", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (chunks) => {
        expect(() => scanAll(chunks)).not.toThrow();
      }),
    );
  });
});
