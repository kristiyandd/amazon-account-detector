import { describe, expect, it, vi } from "vitest";
import { hashEmail } from "@/core/expected";
import { FakeArea } from "@/test/fake-storage";
import { createBadgeUpdater } from "./badge";
import type { BadgeAction } from "./badge";

const NOW = 1_000_000;

function fakeAction(): BadgeAction & {
  readonly texts: string[];
  readonly colors: string[];
} {
  const texts: string[] = [];
  const colors: string[] = [];
  return {
    texts,
    colors,
    setBadgeText: (details) => {
      texts.push(details.text);
      return Promise.resolve();
    },
    setBadgeBackgroundColor: (details) => {
      colors.push(details.color);
      return Promise.resolve();
    },
  };
}

async function signedInAs(email: string): Promise<Record<string, unknown>> {
  const emailHash = await hashEmail(email, crypto.subtle);
  return {
    accounts: {
      schemaVersion: 1,
      byMarketplace: {
        de: { status: "signedIn", email, emailHash, checkedAt: NOW, generation: 0 },
      },
    },
  };
}

async function expectedFor(email: string): Promise<Record<string, unknown>> {
  return {
    prefs: { schemaVersion: 1, selected: "de" },
    expected: {
      schemaVersion: 1,
      byMarketplace: {
        de: { hash: await hashEmail(email, crypto.subtle), hint: "o•••s@example.com" },
      },
    },
  };
}

function setup(
  session: Record<string, unknown>,
  local: Record<string, unknown>,
): {
  readonly action: ReturnType<typeof fakeAction>;
  readonly sessionArea: FakeArea;
  readonly updater: ReturnType<typeof createBadgeUpdater>;
} {
  const action = fakeAction();
  const sessionArea = new FakeArea(session);
  const updater = createBadgeUpdater({
    session: sessionArea,
    local: new FakeArea(local),
    action,
  });
  return { action, sessionArea, updater };
}

describe("badge updater", () => {
  it("shows the selected marketplace's code in green when its expected account is signed in", async () => {
    const { action, updater } = setup(
      await signedInAs("orders@example.com"),
      await expectedFor("Orders@example.com"),
    );
    await updater.refresh();
    expect(action.texts).toEqual(["DE"]);
    expect(action.colors).toEqual(["#11795a"]);
  });

  it("turns red with '!' when another account is signed in where one is expected", async () => {
    const { action, updater } = setup(
      await signedInAs("personal@example.com"),
      await expectedFor("orders@example.com"),
    );
    await updater.refresh();
    expect(action.texts).toEqual(["!"]);
    expect(action.colors).toEqual(["#c0261a"]);
  });

  it("judges the match by the hash stored with the account, without hashing the email again", async () => {
    const { action, updater } = setup(
      {
        accounts: {
          schemaVersion: 1,
          byMarketplace: {
            de: {
              status: "signedIn",
              email: "orders@example.com",
              emailHash: "0f".repeat(32),
              checkedAt: NOW,
              generation: 0,
            },
          },
        },
      },
      await expectedFor("orders@example.com"),
    );
    await updater.refresh();
    expect(action.texts).toEqual(["!"]);
  });

  it("skips the Chrome call when nothing visible changed, so storage storms stay cheap", async () => {
    const { action, updater } = setup(await signedInAs("orders@example.com"), {
      prefs: { schemaVersion: 1, selected: "de" },
    });
    await updater.refresh();
    await updater.refresh();
    expect(action.texts).toEqual(["DE"]);
  });

  it("follows account, expected and selection changes but ignores unrelated keys", async () => {
    const { action, sessionArea, updater } = setup({}, await expectedFor("orders@example.com"));
    await updater.refresh();
    await sessionArea.set(await signedInAs("orders@example.com"));
    await updater.onChanged(["throttle", "debug"]);
    expect(action.texts).toEqual([""]);
    await updater.onChanged(["accounts"]);
    expect(action.texts).toEqual(["", "DE"]);
  });

  it("falls back to an empty badge when storage holds garbage", async () => {
    const { action, updater } = setup({ accounts: "garbage" }, { prefs: 1, expected: [] });
    await updater.refresh();
    expect(action.texts).toEqual([""]);
  });

  it("logs a failed Chrome call and applies the badge again on the next change", async () => {
    const { action, updater } = setup(await signedInAs("orders@example.com"), {
      prefs: { schemaVersion: 1, selected: "de" },
    });
    const error = vi.spyOn(console, "error").mockReturnValue(undefined);
    const failing = vi.spyOn(action, "setBadgeText").mockRejectedValueOnce(new Error("no action"));
    await updater.refresh();
    expect(error).toHaveBeenCalledTimes(1);
    await updater.refresh();
    expect(failing).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
