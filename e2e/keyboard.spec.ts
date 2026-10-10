import { CHALLENGED_FR, expect, SIGNED_IN_US, test } from "./extension";
import type { Page } from "@playwright/test";

const FOCUSED_OUTLINE =
  "(() => { const style = getComputedStyle(document.activeElement); return `${style.outlineStyle} ${style.outlineWidth}`; })()";

async function tabTo(popup: Page, name: string | RegExp): Promise<void> {
  await popup.keyboard.press("Tab");
  await expect(popup.locator(":focus")).toHaveAccessibleName(name);
  expect(await popup.evaluate(FOCUSED_OUTLINE)).toBe("solid 2px");
}

test("the marketplace menu works with the keyboard alone", async ({ popup }) => {
  await popup.evaluate(SIGNED_IN_US(10_000));
  await popup.reload();
  const button = popup.getByRole("button", { name: /Marketplace/u });
  const list = popup.getByRole("listbox", { name: "Marketplace" });

  await popup.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await popup.keyboard.press("Enter");
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute("aria-activedescendant", "marketplace-option-us");
  await popup.keyboard.press("ArrowDown");
  await popup.keyboard.press("ArrowDown");
  await expect(list).toHaveAttribute("aria-activedescendant", "marketplace-option-de");
  await popup.keyboard.press("ArrowUp");
  await expect(list).toHaveAttribute("aria-activedescendant", "marketplace-option-uk");
  await popup.keyboard.press("ArrowDown");
  await popup.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toContainText("Amazon.de");

  await popup.keyboard.press("ArrowDown");
  await expect(list).toBeFocused();
  await popup.keyboard.press("ArrowDown");
  await popup.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toContainText("Amazon.de");
});

test("every control of a signed-in popup is reached with Tab and shows a focus ring", async ({
  popup,
}) => {
  await popup.evaluate(SIGNED_IN_US(10_000));
  await popup.reload();
  await expect(popup.getByText("test.user@example.com", { exact: true })).toBeVisible();

  await tabTo(popup, /Marketplace/u);
  await tabTo(popup, "Copy email");
  await tabTo(popup, "Set as expected");
  await popup.keyboard.press("Enter");
  await expect(popup.getByRole("button", { name: "Remove" })).toBeFocused();
  expect(await popup.evaluate(FOCUSED_OUTLINE)).toBe("solid 2px");
  await tabTo(popup, "Check now");
});

test("the verification link is reached with Tab and shows a focus ring", async ({ popup }) => {
  await popup.evaluate(CHALLENGED_FR);
  await popup.reload();
  await expect(popup.getByRole("link", { name: "Open Amazon.fr" })).toHaveAttribute(
    "href",
    "https://www.amazon.fr/",
  );

  await tabTo(popup, /Marketplace/u);
  await tabTo(popup, "Open Amazon.fr");
  await tabTo(popup, "Check now");
});
