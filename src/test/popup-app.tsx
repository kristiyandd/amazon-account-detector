import { render } from "preact";
import { act } from "preact/test-utils";
import { parseEmail } from "@/core/email";
import type { Email } from "@/core/email";
import type { ExpectedEntry } from "@/core/state";
import type { Snapshot } from "@/popup/api";
import type { JSX } from "preact";

export const ACCOUNT_HASH = "1a".repeat(32);
export const OTHER_HASH = "0f".repeat(32);
export const ACCOUNT_HINT = "t•••r@e•••.com";

function testEmail(): Email {
  const email = parseEmail("test.user@example.com");
  if (email === null) {
    throw new Error("fixture email must parse");
  }
  return email;
}

const EMAIL = testEmail();

export function snapshotWith(checkedAgoMs: number, expected?: ExpectedEntry): Snapshot {
  return {
    accounts: {
      schemaVersion: 1,
      byMarketplace: {
        us: {
          status: "signedIn",
          email: EMAIL,
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
