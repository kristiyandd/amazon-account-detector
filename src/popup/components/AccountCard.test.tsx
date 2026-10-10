import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchStatus } from "@/core/expected";
import { MARKETPLACES } from "@/core/marketplaces";
import type { StatusView } from "@/core/view";
import { ACCOUNT_HASH, OTHER_HASH, OTHER_HINT, TEST_EMAIL, TEST_EMAIL_TEXT } from "@/test/data";
import { buttonNamed, mount, unmountAll } from "@/test/popup-app";
import { buildEntries } from "../model";
import { AccountCard } from "./AccountCard";
import { Summary } from "./Summary";
import type { PinFocus } from "./AccountCard";
import type { Snapshot } from "../api";
import type { JSX } from "preact";

const EXPECTED = { hash: OTHER_HASH, hint: OTHER_HINT };

const SIGNED_IN: StatusView = {
  headline: "Signed in",
  email: TEST_EMAIL_TEXT,
  detail: "Checked 2 min ago, at 14:30",
  pill: { text: "Signed in", tone: "in" },
  staleWarning: null,
  link: null,
};

const SIGNED_OUT: StatusView = {
  headline: "No account is signed in on Amazon.de in this browser.",
  email: null,
  detail: "Checked just now, at 14:30",
  pill: { text: "Not signed in", tone: "out" },
  staleWarning: null,
  link: null,
};

const CHALLENGED: StatusView = {
  headline: "Amazon asked for verification. Open Amazon.de in a tab once, then press Check now.",
  email: null,
  detail: null,
  pill: { text: "Verification needed", tone: "warn" },
  staleWarning: null,
  link: { text: "Open Amazon.de", href: "https://www.amazon.de/" },
};

interface CardOptions {
  readonly view?: StatusView;
  readonly match?: MatchStatus;
  readonly expected?: boolean;
  readonly pinFocus?: PinFocus;
  readonly canPin?: boolean;
}

const onSet = vi.fn<() => void>();
const onClear = vi.fn<() => void>();
const onFocused = vi.fn<() => void>();

function card({
  view = SIGNED_IN,
  match = "none",
  expected = false,
  pinFocus = null,
  canPin = true,
}: CardOptions): JSX.Element {
  return (
    <AccountCard
      marketplace={MARKETPLACES.de}
      view={view}
      match={match}
      expected={expected ? EXPECTED : undefined}
      notice={null}
      pinFocus={pinFocus}
      canPin={canPin}
      onSetExpected={onSet}
      onClearExpected={onClear}
      onPinFocused={onFocused}
    />
  );
}

afterEach(async () => {
  await unmountAll();
  vi.resetAllMocks();
});

describe("AccountCard", () => {
  it("shows the signed-in pill, the avatar initial, the email and its check time", async () => {
    const root = await mount(card({}));
    expect(root.querySelector(".pill.in")?.textContent).toBe("Signed in");
    expect(root.querySelector(".avatar")?.textContent).toBe("T");
    expect(root.textContent).toContain(TEST_EMAIL_TEXT);
    expect(root.textContent).toContain("Checked 2 min ago, at 14:30");
  });

  it("keeps the check time, the buttons and the alerts outside the one live region", async () => {
    const root = await mount(card({ match: "mismatch", expected: true }));
    const live = root.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toBe(`Wrong account: ${TEST_EMAIL_TEXT}`);
    expect(live[0]?.querySelector("button, [role='alert']")).toBeNull();
    expect(live[0]?.textContent).not.toContain("Checked");
  });

  it("labels a stale signed-in result 'Last known' in orange instead of 'Signed in'", async () => {
    const view: StatusView = {
      ...SIGNED_IN,
      pill: { text: "Last known", tone: "warn" },
      staleWarning: "Checked 2 d ago. This may be out of date; press Check now.",
    };
    const root = await mount(card({ view }));
    expect(root.querySelector(".pill.warn")?.textContent).toBe("Last known");
    expect(root.querySelector(".pill.in")).toBeNull();
    expect(root.querySelector(".note.warn")).not.toBeNull();
  });

  it("shows a grey pill, a plain sentence and the check time when signed out", async () => {
    const root = await mount(card({ view: SIGNED_OUT }));
    expect(root.querySelector(".pill.out")?.textContent).toBe("Not signed in");
    expect(root.textContent).toContain("No account is signed in on Amazon.de in this browser.");
    expect(root.querySelector(".since")?.textContent).toBe("Checked just now, at 14:30");
    expect(root.querySelector(".headline")).toBeNull();
  });

  it("shows an orange 'Verification needed' pill with the advice and the link", async () => {
    const root = await mount(card({ view: CHALLENGED }));
    expect(root.querySelector(".pill.warn")?.textContent).toBe("Verification needed");
    expect(root.querySelector("a")?.textContent).toBe("Open Amazon.de");
  });

  it("moves focus to the pin button that a set or remove asked for, once", async () => {
    const root = await mount(card({ match: "match", expected: true, pinFocus: "remove" }));
    expect(document.activeElement).toBe(buttonNamed(root, "Remove"));
    expect(onFocused).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the focusable email heading when asked, so focus never drops to the page", async () => {
    const root = await mount(card({ pinFocus: "heading" }));
    const heading = root.querySelector<HTMLElement>(".email");
    expect(heading?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(heading);
    expect(onFocused).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the headline when no email is shown", async () => {
    await mount(card({ view: SIGNED_OUT, pinFocus: "heading" }));
    expect(document.activeElement?.textContent).toBe(SIGNED_OUT.headline);
  });

  it("hides the Set as expected box when the email has no stored hash to pin", async () => {
    const root = await mount(card({ canPin: false }));
    expect(buttonNamed(root, "Set as expected")).toBeUndefined();
    expect(root.querySelector(".pin")).toBeNull();
  });

  it("offers to set the signed-in account as expected when none is set", async () => {
    const root = await mount(card({}));
    expect(root.textContent).toContain(
      "Warn me if Amazon.de is ever signed in with a different account.",
    );
    await act(() => {
      buttonNamed(root, "Set as expected")?.click();
    });
    expect(onSet).toHaveBeenCalledTimes(1);
  });

  it("tags the expected account and lets the user remove it with one click", async () => {
    const root = await mount(card({ match: "match", expected: true }));
    expect(root.querySelector(".pill.flag")?.textContent).toBe("Expected account");
    expect(root.textContent).toContain("You will be warned if another account signs in here.");
    expect(document.activeElement).not.toBe(buttonNamed(root, "Remove"));
    await act(() => {
      buttonNamed(root, "Remove")?.click();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("raises a red alert naming both accounts when the wrong one is signed in", async () => {
    const root = await mount(card({ match: "mismatch", expected: true }));
    const alert = root.querySelector("[role='alert']");
    expect(alert?.textContent).toContain("Wrong account");
    expect(alert?.textContent).toContain(
      `Signed in as ${TEST_EMAIL_TEXT}, but Amazon.de should use ${OTHER_HINT}.`,
    );
    expect(root.querySelector(".avatar.bad")).not.toBeNull();
    expect(root.querySelector(".pill")).toBeNull();
    expect(buttonNamed(root, "Remove")).toBeUndefined();
  });

  it("raises a red alert when nobody is signed in where an account is expected", async () => {
    const root = await mount(card({ view: SIGNED_OUT, match: "missing", expected: true }));
    expect(root.querySelector("[role='alert']")?.textContent).toContain(
      `Expected account not signed inAmazon.de should use ${OTHER_HINT}.`,
    );
    expect(root.textContent).toContain("No account is signed in on Amazon.de in this browser.");
    expect(root.querySelector(".avatar")).toBeNull();
  });

  it("shows the headline and no copy button when there is no email", async () => {
    const root = await mount(card({ view: SIGNED_OUT }));
    expect(buttonNamed(root, "Copy")).toBeUndefined();
    expect(buttonNamed(root, "Set as expected")).toBeUndefined();
  });

  it("shows a warning box for a result older than a day", async () => {
    const view = { ...SIGNED_IN, staleWarning: "Checked 2 d ago. This may be out of date." };
    const root = await mount(card({ view }));
    expect(root.querySelector(".note.warn")?.textContent).toBe(
      "Checked 2 d ago. This may be out of date.",
    );
  });

  it("links to the marketplace in a new tab when Amazon asks for a visit", async () => {
    const view = {
      ...SIGNED_OUT,
      link: { text: "Open Amazon.de", href: "https://www.amazon.de/" },
    };
    const root = await mount(card({ view }));
    const link = root.querySelector("a");
    expect(link?.textContent).toBe("Open Amazon.de");
    expect(link?.getAttribute("href")).toBe("https://www.amazon.de/");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("Summary", () => {
  it("counts signed-in and wrong accounts and hides the dots from screen readers", async () => {
    const state = {
      status: "signedIn",
      email: TEST_EMAIL,
      emailHash: ACCOUNT_HASH,
      checkedAt: 1000,
      generation: 0,
    } as const;
    const snapshot: Snapshot = {
      accounts: { schemaVersion: 1, byMarketplace: { us: state, de: state } },
      throttle: { schemaVersion: 1, byMarketplace: {} },
      prefs: { schemaVersion: 1, selected: "us" },
      expected: { schemaVersion: 1, byMarketplace: { de: EXPECTED } },
    };
    const entries = buildEntries(snapshot, 2000);
    const root = await mount(<Summary entries={entries} />);
    expect(root.textContent).toBe("2 of 5 marketplaces signed in, 1 wrong account");
    expect(root.querySelectorAll(".dots .dot")).toHaveLength(5);
    expect(root.querySelector(".dots .dot.bad")).not.toBeNull();
    expect(root.querySelector(".dots")?.getAttribute("aria-hidden")).toBe("true");
  });
});
