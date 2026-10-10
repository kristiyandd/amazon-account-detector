import path from "node:path";
import { chromium, test as base } from "@playwright/test";
import type { BrowserContext, Page, Worker } from "@playwright/test";

const EXTENSION_PATH = path.resolve(import.meta.dirname, "..", "dist");

interface ExtensionFixtures {
  readonly context: BrowserContext;
  readonly worker: Worker;
  readonly extensionId: string;
  readonly popup: Page;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({ headless }, provide) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--host-resolver-rules=MAP * ~NOTFOUND",
      ],
    });
    await provide(context);
    await context.close();
  },
  worker: async ({ context }, provide) => {
    await provide(context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ worker }, provide) => {
    await provide(new URL(worker.url()).host);
  },
  popup: async ({ context, extensionId }, provide) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await provide(page);
  },
});

export const SIGNED_IN_US = (
  checkedAgoMs: number,
  generation = 0,
  email = "test.user@example.com",
): string => `
  crypto.subtle.digest("SHA-256", new TextEncoder().encode("${email}")).then((digest) =>
    chrome.storage.session.set({ accounts: { schemaVersion: 1, byMarketplace: { us: {
      status: "signedIn", email: "${email}",
      emailHash: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      checkedAt: Date.now() - ${String(checkedAgoMs)}, generation: ${String(generation)} } } } }))`;

export const CHALLENGED_FR = `Promise.all([
  chrome.storage.session.set({ accounts: { schemaVersion: 1, byMarketplace: { fr: {
    status: "unknown", generation: 0, lastError: { reason: "challenge", at: Date.now() } } } } }),
  chrome.storage.local.set({
    prefs: { schemaVersion: 1, selected: "fr" },
    throttle: { schemaVersion: 1, byMarketplace: { fr: { failures: 1, nextAllowedAt: Date.now() + 3600000 } } },
  }),
])`;

export const BADGE_TEXT = "chrome.action.getBadgeText({})";

export const SET_SESSION_COOKIE = `chrome.cookies.set({ url: "https://www.amazon.com/", name: "at-main",
  value: "e2e", domain: ".amazon.com", secure: true, expirationDate: Date.now() / 1000 + 3600 })`;

export const REMOVE_SESSION_COOKIE = `chrome.cookies.remove({ url: "https://www.amazon.com/", name: "at-main" })`;

export { expect } from "@playwright/test";
