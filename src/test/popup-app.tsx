import { render } from "preact";
import { act } from "preact/test-utils";
import { vi } from "vitest";
import type { ExpectedEntry } from "@/core/state";
import { requestCheck, saveExpected, savePrefs, subscribe } from "@/popup/api";
import type { Snapshot } from "@/popup/api";
import { ACCOUNT_HASH, TEST_EMAIL } from "./data";
import type { JSX } from "preact";

export function stubApi(): void {
  vi.mocked(subscribe).mockReturnValue(vi.fn());
  vi.mocked(requestCheck).mockResolvedValue(true);
  vi.mocked(savePrefs).mockImplementation(() => Promise.resolve());
  vi.mocked(saveExpected).mockImplementation(() => Promise.resolve());
}

export function snapshotWith(checkedAgoMs: number, expected?: ExpectedEntry): Snapshot {
  return {
    accounts: {
      schemaVersion: 1,
      byMarketplace: {
        us: {
          status: "signedIn",
          email: TEST_EMAIL,
          emailHash: ACCOUNT_HASH,
          checkedAt: Date.now() - checkedAgoMs,
          generation: 0,
        },
      },
    },
    throttle: { schemaVersion: 1, byMarketplace: {} },
    prefs: { schemaVersion: 1, selected: "us" },
    expected: { schemaVersion: 1, byMarketplace: expected === undefined ? {} : { us: expected } },
  };
}

export function buttonNamed(host: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((button) => button.textContent === name);
}

let mounted: readonly HTMLElement[] = [];

export async function mount(node: JSX.Element): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  mounted = [...mounted, host];
  await act(() => {
    render(node, host);
  });
  return host;
}

export async function unmountAll(): Promise<void> {
  await act(() => {
    for (const host of mounted) {
      render(null, host);
    }
  });
  mounted = [];
  document.body.replaceChildren();
}

export async function choose(host: HTMLElement, id: string): Promise<void> {
  await act(() => {
    host.querySelector<HTMLButtonElement>("button[aria-haspopup='listbox']")?.click();
  });
  await act(() => {
    host.querySelector<HTMLElement>(`#marketplace-option-${id}`)?.click();
  });
}

export function liveText(host: HTMLElement): string | undefined {
  const regions = host.querySelectorAll("[aria-live]");
  if (regions.length !== 1) {
    throw new Error(`expected one live region, found ${String(regions.length)}`);
  }
  return regions[0]?.textContent;
}
