import { describe, expect, it } from "vitest";
import {
  EXPECTED_ACCOUNT_SUFFIX,
  EXPECTED_MISSING_SUFFIX,
  WRONG_ACCOUNT,
  WRONG_ACCOUNT_SUFFIX,
} from "./copy";

describe("shared copy", () => {
  it("derives the screen-reader suffixes from the visible labels, so both always say the same", () => {
    expect(WRONG_ACCOUNT).toBe("Wrong account");
    expect(WRONG_ACCOUNT_SUFFIX).toBe(", wrong account");
    expect(EXPECTED_ACCOUNT_SUFFIX).toBe(", expected account");
    expect(EXPECTED_MISSING_SUFFIX).toBe(", expected account not signed in");
  });
});
