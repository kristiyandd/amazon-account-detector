import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_HASH, TEST_EMAIL_TEXT } from "@/test/data";
import { captureDebug } from "@/test/debug-capture";
import {
  buttonNamed,
  choose,
  liveText,
  mount,
  snapshotWith,
  stubApi,
  unmountAll,
} from "@/test/popup-app";
import { activeTabMarketplace, readSnapshot, requestCheck, savePrefs } from "./api";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { Snapshot } from "./api";
import type { JSX } from "preact";

vi.mock("./api");

function checkNow(host: HTMLElement): HTMLButtonElement | undefined {
  return buttonNamed(host, "Check now");
}

function text(host: HTMLElement): string {
  return host.textContent;
}

beforeEach(() => {
  stubApi();
});

afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("App", () => {
  it("shows the cached email at once and does not ask Amazon again within a minute", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain(TEST_EMAIL_TEXT);
    });
    expect(requestCheck).not.toHaveBeenCalled();
  });

  it("logs that fresh data needs no check", async () => {
    const capture = captureDebug();
    try {
      vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
      const host = await mount(<App />);
      await vi.waitFor(() => {
        expect(text(host)).toContain(TEST_EMAIL_TEXT);
      });
      expect(capture.lines()).toEqual([
        "[account-detector] popup: open, selected=us",
        "[account-detector] popup: us fresh → no check",
      ]);
    } finally {
      capture.stop();
    }
  });

  it("re-checks older data on open and shows 'Checking…' under the cached result", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(600_000));
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(requestCheck).toHaveBeenCalledWith("us", false);
    });
    expect(text(host)).toContain(TEST_EMAIL_TEXT);
    expect(text(host)).toContain("Checking…");
  });

  it("opens on the marketplace of the active Amazon tab, saves it and checks it", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    vi.mocked(activeTabMarketplace).mockResolvedValue("de");
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(requestCheck).toHaveBeenCalledWith("de", false);
    });
    expect(savePrefs).toHaveBeenCalledWith("de");
    expect(host.querySelector("[aria-haspopup=listbox]")?.textContent).toContain("Amazon.de");
    expect(text(host)).not.toContain(TEST_EMAIL_TEXT);
  });

  it("opens on the last chosen marketplace when the active tab is not an Amazon site", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    vi.mocked(activeTabMarketplace).mockResolvedValue(undefined);
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain(TEST_EMAIL_TEXT);
    });
    expect(savePrefs).not.toHaveBeenCalled();
    expect(requestCheck).not.toHaveBeenCalled();
  });

  it("does not save the marketplace again when the tab is on the one already chosen", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    vi.mocked(activeTabMarketplace).mockResolvedValue("us");
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain(TEST_EMAIL_TEXT);
    });
    expect(savePrefs).not.toHaveBeenCalled();
  });

  it("saves the new marketplace and checks it when the user switches", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain(TEST_EMAIL_TEXT);
    });
    await choose(host, "de");
    expect(savePrefs).toHaveBeenCalledWith("de");
    expect(requestCheck).toHaveBeenCalledWith("de", false);
    expect(text(host)).not.toContain(TEST_EMAIL_TEXT);
  });

  it("sends a manual check, counts the 30 s cooldown down and enables the button again at 0", async () => {
    vi.useFakeTimers();
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain(TEST_EMAIL_TEXT);
    });
    await act(() => {
      checkNow(host)?.click();
    });
    expect(requestCheck).toHaveBeenCalledWith("us", true);
    expect(checkNow(host)?.disabled).toBe(true);
    expect(text(host)).toContain("Check again in 30 s");
    await act(() => {
      vi.advanceTimersByTime(18_000);
    });
    expect(text(host)).toContain("Check again in 12 s");
    await act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(checkNow(host)?.disabled).toBe(false);
    expect(text(host)).not.toContain("Check again");
  });

  it("keeps the cooldown the worker recorded when the popup is opened again", async () => {
    const snapshot = snapshotWith(10_000);
    vi.mocked(readSnapshot).mockResolvedValue({
      ...snapshot,
      throttle: {
        schemaVersion: 1,
        byMarketplace: { us: { failures: 0, nextAllowedAt: 0, lastManualAt: Date.now() - 18_000 } },
      },
    });
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain("Check again in 12 s");
    });
    expect(checkNow(host)?.disabled).toBe(true);
  });

  it("says when the check could not be started and leaves 'Check now' usable", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(600_000));
    vi.mocked(requestCheck).mockResolvedValue(false);
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain("Couldn't start the check");
    });
    expect(checkNow(host)?.disabled).toBe(false);
  });

  it("shows only the last marketplace picked when the user switches quickly", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const host = await mount(<App />);
    await choose(host, "de");
    await choose(host, "fr");
    await choose(host, "it");
    expect(host.querySelector("button[aria-haspopup='listbox']")?.textContent).toContain(
      "Amazon.it",
    );
    expect(vi.mocked(requestCheck).mock.calls.map(([id]) => id)).toEqual(["de", "fr", "it"]);
    expect(text(host)).not.toContain(TEST_EMAIL_TEXT);
  });

  it("checks the marketplace picked before the first load finished, not the stored one", async () => {
    const loading: { resolve?: (snapshot: Snapshot) => void } = {};
    vi.mocked(readSnapshot).mockReturnValue(
      new Promise<Snapshot>((resolve) => {
        loading.resolve = resolve;
      }),
    );
    const host = await mount(<App />);
    await choose(host, "de");
    await act(() => {
      loading.resolve?.(snapshotWith(600_000));
    });
    await vi.waitFor(() => {
      expect(vi.mocked(requestCheck)).toHaveBeenCalled();
    });
    expect(vi.mocked(requestCheck).mock.calls.map(([id]) => id)).toEqual(["de"]);
  });

  it("can be closed while a check is still running, and ignores the late answer instead of updating the closed popup", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(600_000));
    const late: { resolve?: (accepted: boolean) => void } = {};
    vi.mocked(requestCheck).mockReturnValue(
      new Promise<boolean>((resolve) => {
        late.resolve = resolve;
      }),
    );
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(requestCheck).toHaveBeenCalledTimes(1);
    });
    await act(() => {
      render(null, host);
    });
    const capture = captureDebug();
    try {
      await act(async () => {
        late.resolve?.(false);
        await Promise.resolve();
      });
      expect(capture.lines()).toEqual(["[account-detector] popup: closed, answer for us ignored"]);
      expect(host.textContent).toBe("");
    } finally {
      capture.stop();
    }
  });

  it("shows a failed start only on the marketplace it belongs to", async () => {
    const stale = snapshotWith(600_000).accounts.byMarketplace.us;
    const fresh = { status: "signedOut", checkedAt: Date.now() - 10_000, generation: 0 } as const;
    vi.mocked(readSnapshot).mockResolvedValue({
      ...snapshotWith(600_000),
      accounts: {
        schemaVersion: 1,
        byMarketplace: { us: stale, de: fresh },
      },
    });
    vi.mocked(requestCheck).mockResolvedValue(false);
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain("Couldn't start the check");
    });
    vi.mocked(requestCheck).mockClear();
    await choose(host, "de");
    expect(text(host)).not.toContain("Couldn't start the check");
    expect(requestCheck).not.toHaveBeenCalledWith("de", false);
  });

  it("ignores a late answer for a marketplace the user already left", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const late: { resolve?: (accepted: boolean) => void } = {};
    const parked: { resolve?: (accepted: boolean) => void } = {};
    vi.mocked(requestCheck)
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          late.resolve = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          parked.resolve = resolve;
        }),
      );
    const host = await mount(<App />);
    await choose(host, "de");
    await choose(host, "fr");
    expect(vi.mocked(requestCheck).mock.calls).toEqual([
      ["de", false],
      ["fr", false],
    ]);
    await act(async () => {
      late.resolve?.(false);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(text(host)).not.toContain("Couldn't start the check");
    expect(text(host)).toContain("Checking…");
  });

  it("announces only the verdict, so the age ticking every minute is never re-read", async () => {
    vi.useFakeTimers();
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain("Checked just now");
    });
    const before = liveText(host);
    expect(before).toBe(`Signed in: ${TEST_EMAIL_TEXT}`);
    await act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(text(host)).toContain("Checked 1 min ago");
    expect(liveText(host)).toBe(before);
    expect(host.querySelector("[aria-live] button, [aria-live] [role='alert']")).toBeNull();
  });

  it("states the privacy promise and the overview of all marketplaces", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(snapshotWith(10_000));
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(text(host)).toContain("1 of 5 marketplaces signed in");
    });
    expect(text(host)).toContain("The extension never sends your email anywhere.");
  });

  it("reaches every control with Tab in reading order", async () => {
    vi.mocked(readSnapshot).mockResolvedValue({
      ...snapshotWith(10_000),
      expected: { schemaVersion: 1, byMarketplace: { us: { hash: OTHER_HASH, hint: "x" } } },
    });
    const host = await mount(<App />);
    await vi.waitFor(() => {
      expect(buttonNamed(host, "Expect this account instead")).toBeDefined();
    });
    const tabbable = [...host.querySelectorAll<HTMLElement>("button, a[href]")].filter(
      (element) => element.tabIndex >= 0,
    );
    expect(tabbable.map((element) => element.textContent)).toEqual([
      "USMarketplaceAmazon.com, wrong account",
      "Copy",
      "Check now",
      "Expect this account instead",
    ]);
  });
});

function Thrower(): JSX.Element {
  throw new Error("render failed");
}

describe("ErrorBoundary", () => {
  it("logs the crash and shows a recovery message instead of a blank popup", async () => {
    const error = vi.spyOn(console, "error").mockReturnValue(undefined);
    const host = await mount(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(host.querySelector(".note.warn")?.textContent).toContain("Something went wrong");
    expect(error).toHaveBeenCalledWith(
      "[account-detector] Popup render failed: Error: render failed",
    );
  });
});
