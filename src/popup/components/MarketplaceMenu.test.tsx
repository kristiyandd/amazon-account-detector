import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceId } from "@/core/marketplaces";
import { ACCOUNT_HASH, OTHER_HASH, STORED_HINT, TEST_EMAIL, TEST_EMAIL_TEXT } from "@/test/data";
import { mount, unmountAll } from "@/test/popup-app";
import { buildEntries } from "../model";
import { MarketplaceMenu } from "./MarketplaceMenu";
import type { Snapshot } from "../api";

const NOW = 200_000_000;
function snapshot(): Snapshot {
  return {
    accounts: {
      schemaVersion: 1,
      byMarketplace: {
        us: {
          status: "signedIn",
          email: TEST_EMAIL,
          emailHash: ACCOUNT_HASH,
          checkedAt: NOW - 120_000,
          generation: 0,
        },
        de: {
          status: "signedIn",
          email: TEST_EMAIL,
          emailHash: ACCOUNT_HASH,
          checkedAt: NOW - 300_000,
          generation: 0,
        },
        uk: { status: "signedOut", checkedAt: NOW - 90_000_000, generation: 0 },
        fr: { status: "unknown", generation: 0, lastError: { reason: "challenge", at: NOW } },
      },
    },
    throttle: { schemaVersion: 1, byMarketplace: {} },
    prefs: { schemaVersion: 1, selected: "us" },
    expected: {
      schemaVersion: 1,
      byMarketplace: { de: { hash: OTHER_HASH, hint: STORED_HINT } },
    },
  };
}

const entries = buildEntries(snapshot(), NOW);

async function mountMenu(selected: MarketplaceId = "us"): Promise<{
  readonly root: HTMLElement;
  readonly onSelect: ReturnType<typeof vi.fn<(id: MarketplaceId) => void>>;
}> {
  const onSelect = vi.fn<(id: MarketplaceId) => void>();
  const root = await mount(
    <MarketplaceMenu entries={entries} selected={selected} onSelect={onSelect} />,
  );
  return { root, onSelect };
}

function button(root: HTMLElement): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>("button[aria-haspopup='listbox']");
  if (found === null) {
    throw new Error("switch button missing");
  }
  return found;
}

function listbox(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>("[role='listbox']");
}

function activeId(root: HTMLElement): string | null {
  return listbox(root)?.getAttribute("aria-activedescendant") ?? null;
}

async function press(target: Element | null, key: string): Promise<boolean> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(() => {
    target?.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

async function open(root: HTMLElement): Promise<HTMLElement> {
  await act(() => {
    button(root).click();
  });
  const list = listbox(root);
  if (list === null) {
    throw new Error("listbox did not open");
  }
  return list;
}

afterEach(async () => {
  await unmountAll();
});

describe("MarketplaceMenu", () => {
  it("is a closed listbox button named after the current marketplace", async () => {
    const { root } = await mountMenu();
    expect(button(root).getAttribute("aria-expanded")).toBe("false");
    expect(button(root).textContent).toContain("Amazon.com");
    expect(listbox(root)).toBeNull();
  });

  it("opens on click, moves focus into the list and marks the current marketplace", async () => {
    const { root } = await mountMenu();
    const list = await open(root);
    expect(button(root).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(list);
    expect(activeId(root)).toBe("marketplace-option-us");
    expect(root.querySelector("#marketplace-option-us")?.getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("opens with Enter on the button", async () => {
    const { root } = await mountMenu();
    expect(await press(button(root), "Enter")).toBe(true);
    expect(listbox(root)).not.toBeNull();
  });

  it("opens with ArrowDown on the button", async () => {
    const { root } = await mountMenu();
    await press(button(root), "ArrowDown");
    expect(listbox(root)).not.toBeNull();
    expect(activeId(root)).toBe("marketplace-option-us");
  });

  it("opens with ArrowUp on the button", async () => {
    const { root } = await mountMenu();
    await press(button(root), "ArrowUp");
    expect(listbox(root)).not.toBeNull();
  });

  it("moves down with ArrowDown and wraps from the last option to the first", async () => {
    const { root } = await mountMenu("fr");
    const list = await open(root);
    expect(await press(list, "ArrowDown")).toBe(true);
    expect(activeId(root)).toBe("marketplace-option-us");
    await press(list, "ArrowDown");
    expect(activeId(root)).toBe("marketplace-option-uk");
  });

  it("moves up with ArrowUp and wraps from the first option to the last", async () => {
    const { root } = await mountMenu();
    const list = await open(root);
    expect(await press(list, "ArrowUp")).toBe(true);
    expect(activeId(root)).toBe("marketplace-option-fr");
    await press(list, "ArrowUp");
    expect(activeId(root)).toBe("marketplace-option-it");
  });

  it("jumps to the first option with Home", async () => {
    const { root } = await mountMenu("it");
    const list = await open(root);
    await press(list, "Home");
    expect(activeId(root)).toBe("marketplace-option-us");
  });

  it("jumps to the last option with End", async () => {
    const { root } = await mountMenu();
    const list = await open(root);
    await press(list, "End");
    expect(activeId(root)).toBe("marketplace-option-fr");
  });

  it("jumps to a marketplace by the first letter of its code and cycles on repeats", async () => {
    const { root } = await mountMenu("de");
    const list = await open(root);
    await press(list, "f");
    expect(activeId(root)).toBe("marketplace-option-fr");
    await press(list, "U");
    expect(activeId(root)).toBe("marketplace-option-us");
    await press(list, "u");
    expect(activeId(root)).toBe("marketplace-option-uk");
  });

  it("ignores a letter that matches no marketplace", async () => {
    const { root } = await mountMenu();
    const list = await open(root);
    await press(list, "z");
    expect(activeId(root)).toBe("marketplace-option-us");
  });

  it("chooses the active option with Enter, closes and returns focus to the button", async () => {
    const { root, onSelect } = await mountMenu();
    const list = await open(root);
    await press(list, "ArrowDown");
    expect(await press(list, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenCalledWith("uk");
    expect(listbox(root)).toBeNull();
    expect(document.activeElement).toBe(button(root));
  });

  it("chooses the active option with Space", async () => {
    const { root, onSelect } = await mountMenu();
    const list = await open(root);
    await press(list, "End");
    await press(list, " ");
    expect(onSelect).toHaveBeenCalledWith("fr");
    expect(listbox(root)).toBeNull();
  });

  it("closes with Escape without choosing and returns focus to the button", async () => {
    const { root, onSelect } = await mountMenu();
    const list = await open(root);
    await press(list, "ArrowDown");
    expect(await press(list, "Escape")).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    expect(listbox(root)).toBeNull();
    expect(document.activeElement).toBe(button(root));
  });

  it("closes with Tab without choosing and returns focus to the button", async () => {
    const { root, onSelect } = await mountMenu();
    const list = await open(root);
    await press(list, "Tab");
    expect(onSelect).not.toHaveBeenCalled();
    expect(listbox(root)).toBeNull();
    expect(document.activeElement).toBe(button(root));
  });

  it("chooses an option on click", async () => {
    const { root, onSelect } = await mountMenu();
    await open(root);
    await act(() => {
      root.querySelector<HTMLElement>("#marketplace-option-de")?.click();
    });
    expect(onSelect).toHaveBeenCalledWith("de");
    expect(listbox(root)).toBeNull();
  });

  it("closes on a click outside the menu", async () => {
    const { root, onSelect } = await mountMenu();
    await open(root);
    await act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(listbox(root)).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes when the button is clicked again", async () => {
    const { root } = await mountMenu();
    await open(root);
    await act(() => {
      button(root).click();
    });
    expect(listbox(root)).toBeNull();
  });

  it("shows each marketplace's cached state, age and dot without asking Amazon", async () => {
    const { root } = await mountMenu();
    await open(root);
    const option = (id: string): string =>
      root.querySelector(`#marketplace-option-${id}`)?.textContent ?? "";
    expect(option("us")).toContain(TEST_EMAIL_TEXT);
    expect(option("us")).toContain("2 min");
    expect(option("de")).toContain(`Wrong account: ${TEST_EMAIL_TEXT}`);
    expect(option("uk")).toContain("Not signed in");
    expect(option("it")).toContain("Not checked yet");
    expect(option("fr")).toContain("Needs one visit to Amazon.fr");
    expect(root.querySelector("#marketplace-option-de .dot.bad")).not.toBeNull();
    expect(root.querySelector("#marketplace-option-uk .age.stale")).not.toBeNull();
  });

  it("names the warning dot on the button, so screen readers hear the wrong account too", async () => {
    const wrong = await mountMenu("de");
    expect(button(wrong.root).textContent).toBe("DEMarketplaceAmazon.de, wrong account");
    expect(button(wrong.root).querySelector(".dot.bad")).not.toBeNull();
  });

  it("names a missing expected account on the button and adds nothing when all is well", async () => {
    const base = snapshot();
    const missing = buildEntries(
      {
        ...base,
        expected: { schemaVersion: 1, byMarketplace: { uk: { hash: ACCOUNT_HASH, hint: "x" } } },
      },
      NOW,
    );
    const root = await mount(
      <MarketplaceMenu entries={missing} selected="uk" onSelect={vi.fn()} />,
    );
    expect(button(root).textContent).toContain(", expected account not signed in");
    await act(() => {
      render(<MarketplaceMenu entries={missing} selected="us" onSelect={vi.fn()} />, root);
    });
    expect(button(root).textContent).toBe("USMarketplaceAmazon.com");
  });

  it("shows the key hints the list supports", async () => {
    const { root } = await mountMenu();
    await open(root);
    expect(root.textContent).toContain("to move");
    expect(root.textContent).toContain("Enter to choose");
    expect(root.textContent).toContain("Esc to close");
  });
});
