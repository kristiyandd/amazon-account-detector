# ADR-0005: Per-marketplace `openid.assoc_handle`, and what a non-sign-in answer means

- Status: Accepted; the signed-in capture (same day) is recorded in ADR-0006 and ADR-0007
- Date: 2026-10-10

## Context

The brief gives the account-switcher URL with `openid.assoc_handle=usflex` and says the handle
"may need to vary by marketplace - figure out what works". Research suggested `usflex` works on
every marketplace and that the handle only affects a redirect the extension never follows. That
was a guess; it had to be measured.

## Experiment

A real Chromium (Playwright, headless, `en-US`, no cookies) loaded the brief's URL for each
marketplace, once with `usflex` and once with the local `<cc>flex` handle, 9 requests, one at a
time, 2.5–4.5 s apart.

| Marketplace | `usflex`                                      | Local handle                     |
| ----------- | --------------------------------------------- | -------------------------------- |
| `.com`      | 200, sign-in page (redirected to `/ax/claim`) | none (`usflex` is the local one) |
| `.co.uk`    | **202, AWS WAF challenge** (2 kB)             | `gbflex`: 200, sign-in page      |
| `.de`       | **404**, "Suchst du etwas?"                   | `deflex`: 200, sign-in page      |
| `.it`       | **404**                                       | `itflex`: 200, sign-in page      |
| `.fr`       | **202, AWS WAF challenge** (2 kB)             | `frflex`: 200, sign-in page      |

## Decision

- The marketplaces table carries the handle per market: `usflex`, `gbflex`, `deflex`, `itflex`,
  `frflex`. A unit test pins the mapping.
- A response is classified before any parsing:
  - **200 with a sign-in form** → signed out
  - **202 with an AWS WAF challenge** (`gokuProps` / `awsWafCookieDomainList`) → `challenge`:
    keep the last state, mark it stale, back off, and never say "signed out"
  - **404 or any unexpected shape** → `error: parse`, never "signed out"
- The parser follows the final URL, not the requested one: `.com` lands on `/ax/claim`.
- Refined by the signed-in capture: the claim (`#ap-claim`) is read before any challenge
  markup, and a page's answer must be confirmed by the session cookie (ADR-0007)
  §5 and ADR-0007.

## Consequences

- Good: the wrong handle would have broken detection on 4 of 5 marketplaces; the mapping is now
  data with a test, and a future marketplace is one row plus one capture
- Good: the WAF challenge is a known, testable state with a real fixture
- Settled later the same day by the signed-in capture: the email is in `#ap-claim`, `at-main`
  proves a session, and the fetch leaves the session cookies untouched (ADR-0007, F2–F9)

## Verification

The table above was produced by a one-off Playwright script. The raw pages and the script are not
in the repository, because the pages contain session data. The anonymised pages are the fixtures in
`src/test/fixtures/`, and `src/core/marketplaces.test.ts` pins the handles. Measure again before
changing them.
