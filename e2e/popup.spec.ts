import AxeBuilder from "@axe-core/playwright";
import { BADGE_TEXT, CHALLENGED_FR, expect, SIGNED_IN_US, test } from "./extension";

test("the popup renders a signed-in state with no accessibility violations", async ({ popup }) => {
  await popup.evaluate(SIGNED_IN_US(10_000));
  await popup.reload();

  await expect(popup.getByRole("heading", { name: "Amazon Account Detector" })).toBeAttached();
  await expect(popup.getByText("test.user@example.com", { exact: true })).toBeVisible();
  await expect(popup.getByRole("button", { name: /Marketplace/u })).toContainText("Amazon.com");
  const results = await new AxeBuilder({ page: popup }).analyze();
  expect(results.violations).toEqual([]);

  await popup.getByRole("button", { name: /Marketplace/u }).click();
  await expect(popup.getByRole("listbox", { name: "Marketplace" })).toBeVisible();
  const open = await new AxeBuilder({ page: popup }).analyze();
  expect(open.violations).toEqual([]);
});

test("the popup has no accessibility violations in dark mode either", async ({ popup }) => {
  await popup.emulateMedia({ colorScheme: "dark" });
  await popup.evaluate(CHALLENGED_FR);
  await popup.reload();
  await expect(popup.getByRole("link", { name: "Open Amazon.fr" })).toBeVisible();
  const challenged = await new AxeBuilder({ page: popup }).analyze();
  expect(challenged.violations).toEqual([]);

  await popup.evaluate(SIGNED_IN_US(10_000));
  await popup.evaluate("chrome.storage.local.set({ prefs: { schemaVersion: 1, selected: 'us' } })");
  await popup.reload();
  await expect(popup.getByRole("button", { name: "Set as expected" })).toBeVisible();
  const signedIn = await new AxeBuilder({ page: popup }).analyze();
  expect(signedIn.violations).toEqual([]);

  await popup.getByRole("button", { name: "Set as expected" }).click();
  await popup.evaluate(SIGNED_IN_US(10_000, 0, "other.user@example.com"));
  await expect(popup.getByRole("alert")).toContainText("Wrong account");
  const wrong = await new AxeBuilder({ page: popup }).analyze();
  expect(wrong.violations).toEqual([]);
});

test("an expected account turns the popup and the toolbar badge red when another account signs in", async ({
  popup,
  worker,
}) => {
  await popup.evaluate(SIGNED_IN_US(10_000));
  await popup.reload();
  await popup.getByRole("button", { name: "Set as expected" }).click();
  await expect(popup.getByText("Expected account", { exact: true })).toBeVisible();
  await expect.poll(() => worker.evaluate(BADGE_TEXT)).toBe("US");

  await popup.evaluate(SIGNED_IN_US(10_000, 0, "other.user@example.com"));

  await expect(popup.getByRole("alert")).toContainText("Wrong account");
  await expect(popup.getByRole("alert")).toContainText("t•••r@e•••.com");
  await expect.poll(() => worker.evaluate(BADGE_TEXT)).toBe("!");
  const results = await new AxeBuilder({ page: popup }).analyze();
  expect(results.violations).toEqual([]);
});
