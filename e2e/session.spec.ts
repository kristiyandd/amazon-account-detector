import { expect, REMOVE_SESSION_COOKIE, SET_SESSION_COOKIE, SIGNED_IN_US, test } from "./extension";

test("the popup's check reaches the worker and a failure keeps the cached email", async ({
  popup,
}) => {
  await popup.evaluate(SIGNED_IN_US(600_000));
  await popup.reload();

  await expect(popup.getByText("test.user@example.com", { exact: true })).toBeVisible();
  await expect(
    popup.getByText(/Couldn't reach Amazon\. Showing the result from 10 min ago\./u),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(popup.getByText("test.user@example.com", { exact: true })).toBeVisible();
});

test("logging out in the browser removes the email from the open popup", async ({ popup }) => {
  await popup.evaluate(SET_SESSION_COOKIE);
  await expect
    .poll(() =>
      popup.evaluate(
        "chrome.storage.session.get('accounts').then((r) => r.accounts?.byMarketplace?.us?.generation ?? 0)",
      ),
    )
    .toBe(1);
  await popup.evaluate(SIGNED_IN_US(10_000, 1));
  await popup.reload();
  await expect(popup.getByText("test.user@example.com", { exact: true })).toBeVisible();

  await popup.evaluate(REMOVE_SESSION_COOKIE);

  await expect(popup.getByRole("status")).toHaveText(
    "No account is signed in on Amazon.com in this browser.",
  );
  await expect(popup.getByText("Not signed in", { exact: true })).toBeVisible();
  await expect(popup.getByText("test.user@example.com", { exact: true })).toBeHidden();
});
