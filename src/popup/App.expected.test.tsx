import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_HASH, ACCOUNT_HINT, OTHER_HASH, OTHER_HINT, TEST_EMAIL_TEXT } from "@/test/data";
import { buttonNamed, liveText, mount, snapshotWith, stubApi, unmountAll } from "@/test/popup-app";
import { readSnapshot, saveExpected, subscribe } from "./api";
import { App } from "./App";
import type { Snapshot } from "./api";

vi.mock("./api");

const listeners: { current: (() => void) | null } = { current: null };

function emailHeading(host: HTMLElement): HTMLElement | null {
  return host.querySelector<HTMLElement>(".email");
}

function inCooldown(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    throttle: {
      schemaVersion: 1,
      byMarketplace: { us: { failures: 0, nextAllowedAt: 0, lastManualAt: Date.now() - 5_000 } },
    },
  };
}

async function storageChanged(next: Snapshot): Promise<void> {
  vi.mocked(readSnapshot).mockResolvedValue(next);
  await act(async () => {
    listeners.current?.();
    await Promise.resolve();
  });
}

beforeEach(() => {
  stubApi();
  vi.mocked(subscribe).mockImplementation((listener) => {
    listeners.current = listener;
    return vi.fn();
  });
});

afterEach(async () => {
  await unmountAll();
  listeners.current = null;
  vi.resetAllMocks();
});

describe("App expected account", () => {
  it("copies the hash the worker stored and a masked hint, then moves focus to Remove", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(buttonNamed(host, "Set as expected")).toBeDefined();
    });
    await act(() => {
      buttonNamed(host, "Set as expected")?.click();
    });
    expect(saveExpected).toHaveBeenCalledWith("us", { hash: ACCOUNT_HASH, hint: ACCOUNT_HINT });
    await storageChanged(snapshotWith(10_000, { hash: ACCOUNT_HASH, hint: ACCOUNT_HINT }));
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(buttonNamed(host, "Remove"));
    });
    expect(liveText(host)).toBe(`Signed in: ${TEST_EMAIL_TEXT}, expected account`);
  });

  it("warns about a wrong account, expects the current one instead and focuses the email heading", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(
      snapshotWith(10_000, { hash: OTHER_HASH, hint: OTHER_HINT }),
    );
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(host.querySelector("[role='alert']")?.textContent).toContain("Wrong account");
    });
    expect(host.textContent).toContain("1 of 5 marketplaces signed in, 1 wrong account");
    await act(() => {
      buttonNamed(host, "Expect this account instead")?.click();
    });
    expect(saveExpected).toHaveBeenCalledWith("us", { hash: ACCOUNT_HASH, hint: ACCOUNT_HINT });
    expect(document.activeElement).toBe(emailHeading(host));
    await storageChanged(snapshotWith(10_000, { hash: ACCOUNT_HASH, hint: ACCOUNT_HINT }));
    expect(document.activeElement).toBe(emailHeading(host));
  });

  it("focuses the email heading, not the disabled Check now, when the cooldown runs", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(
      inCooldown(snapshotWith(10_000, { hash: OTHER_HASH, hint: OTHER_HINT })),
    );
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(host.textContent).toContain("Check again in");
    });
    expect(buttonNamed(host, "Check now")?.disabled).toBe(true);
    await act(() => {
      buttonNamed(host, "Expect this account instead")?.click();
    });
    expect(document.activeElement).toBe(emailHeading(host));
    expect(emailHeading(host)?.tabIndex).toBe(-1);
  });

  it("removes the expected account in one click, announces it and focuses the email heading", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(
      snapshotWith(10_000, { hash: ACCOUNT_HASH, hint: ACCOUNT_HINT }),
    );
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(host.textContent).toContain("Expected account");
    });
    await act(() => {
      buttonNamed(host, "Remove")?.click();
    });
    expect(saveExpected).toHaveBeenCalledWith("us", null);
    expect(liveText(host)).toContain("Expected account removed");
    expect(document.activeElement).toBe(emailHeading(host));
    await storageChanged(snapshotWith(10_000));
    expect(document.activeElement).toBe(emailHeading(host));
  });

  it("focuses the email heading after Remove while Check now is disabled by the cooldown", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(
      inCooldown(snapshotWith(10_000, { hash: ACCOUNT_HASH, hint: ACCOUNT_HINT })),
    );
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(host.textContent).toContain("Check again in");
    });
    await act(() => {
      buttonNamed(host, "Remove")?.click();
    });
    await storageChanged(inCooldown(snapshotWith(10_000)));
    expect(document.activeElement).toBe(emailHeading(host));
    expect(buttonNamed(host, "Check now")?.disabled).toBe(true);
  });

  it("does not offer Set as expected when the worker stored no hash for the email", async () => {
    const snapshot = snapshotWith(10_000);
    const { emailHash: _hash, ...withoutHash } = snapshot.accounts.byMarketplace.us ?? {
      status: "unknown",
      generation: 0,
    };
    vi.mocked(readSnapshot).mockResolvedValue({
      ...snapshot,
      accounts: { schemaVersion: 1, byMarketplace: { us: withoutHash } },
    });
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(host.textContent).toContain(TEST_EMAIL_TEXT);
    });
    expect(buttonNamed(host, "Set as expected")).toBeUndefined();
    expect(host.querySelector(".pin")).toBeNull();
  });

  it("shows the wrong-account alert in the very first frame that shows the email", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(
      snapshotWith(10_000, { hash: OTHER_HASH, hint: OTHER_HINT }),
    );
    let frames: readonly string[] = [];
    const observer = new MutationObserver(() => {
      frames = [...frames, document.body.textContent];
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(host.textContent).toContain(TEST_EMAIL_TEXT);
    });
    observer.disconnect();
    const withEmail = frames.filter((frame) => frame.includes(TEST_EMAIL_TEXT));
    expect(withEmail.length).toBeGreaterThan(0);
    expect(withEmail.every((frame) => frame.includes("Wrong account"))).toBe(true);
  });
});
