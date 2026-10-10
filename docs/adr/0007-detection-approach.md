# ADR-0007: Detect the account with an on-demand sign-in fetch and a session-cookie watcher

- Status: Accepted
- Date: 2026-10-10
- Builds on: ADR-0005 (sign-in parameters), ADR-0006 (cookie host permissions)

## Context

The brief: the user picks an Amazon marketplace in the popup and sees whether they are signed in
there, and with which email, without disturbing their tabs. The facts F1-F14 below were measured
live on 2026-10-10 and decide the approach:

- F1, F11: the handle must be local to the marketplace; `.co.uk` and `.fr` sometimes answer 202
  with an empty body or a WAF challenge
- F2, F3, F4: the brief's sign-in URL, fetched from the service worker with the session, returns
  the email in `#ap-claim` in about 0.9 s and leaves the session intact
- F5: `DOMParser` does not exist in the service worker
- F6, F7, F8, F14: with wildcard hosts the cookies API sees the session cookies; logout removes
  `at-main`; `sst-main` churns and must be ignored; an update fires an overwrite then an add
- F9, F10: signed out is a 200 sign-in form with no `#ap-claim`; a `.com` account says nothing
  about the EU marketplaces
- F12: if the user blocks third-party cookies, the extension's fetch may not carry the session
- F13: `storage.session` is memory only and is cleared on restart, disable, reload and update

## Considered options

1. **On-demand service-worker fetch of the sign-in page, plus a session-cookie watcher.** Check
   when the popup opens or the marketplace changes; react to cookie changes without a request
2. **Periodic polling.** Re-fetch every N minutes. A stale email stays up to N minutes and Amazon is
   hit around the clock, which risks the WAF challenges already seen with low-volume requests (F11)
3. **A background tab or an offscreen document.** Could parse with a DOM, but it loads the full
   page with scripts and either disturbs the user's tabs or needs another permission
4. **The account page `/gp/css/homepage.html`.** A bigger page with more layout risk, and it would
   likely redirect to sign-in when signed out (not measured); the sign-in page already carries the
   email (F2)

## Decision

Option 1.

- The email is read from `#ap-claim` by a streaming string scanner over the response body (F5),
  capped at 512 KiB. The page and the session cookie must agree; a disagreement is
  `sessionMismatch`, which also drops the email, so an unconfirmed email is never shown
- A session-cookie write forgets the cached account at once (status `unknown`, generation + 1);
  a removal that is not an overwrite (F14) sets `signedOut`. Neither sends a request
- Cookie-triggered checks are debounced (500 ms) and run at most once per 20 s per marketplace;
  a write inside that window schedules one check for the end of the window instead of being
  dropped, so a quick second sign-in is still checked
- **Worker lifetime limit.** A pending `setTimeout` does not keep an MV3 service worker alive;
  Chrome stops it after about 30 s without events. The cookie event that schedules the check
  resets that idle timer, so every cookie timer is kept at 20 s or less (a test asserts each
  delay is under 25 s). The window was 60 s at first, and a trailing check due up to 60 s later
  was usually lost with the stopped worker. `chrome.alarms` (30 s minimum) would need the
  `alarms` permission back; a shorter window needs nothing new. If the worker is stopped anyway,
  the account stays `unknown` and the next popup open checks it
- **Check now** bypasses the challenge backoff but not a 30 s cooldown per marketplace, which the
  worker enforces from `lastManualAt` in the stored throttle; the popup shows the countdown from
  the same value, so reopening the popup does not reset it
- No polling, so no `alarms`; a challenge backoff is a stored timestamp (30 min doubling, cap
  6 h, honouring `Retry-After`)

### Changes made during implementation

- **Equal jitter instead of full jitter.** Full jitter can wait about 0 s and hit the WAF again at
  once; equal jitter waits between half and all of the ceiling, so the first wait is 15-30 min
- **A synchronous `sendResponse` router.** A Promise-returning `onMessage` listener is not
  documented for Chrome 120; the router replies `{ accepted }` at once and the result travels
  through `storage.onChanged`
- **Claim before challenge markup.** The classifier checks status, then host, then the claim, then
  challenge markup, then the sign-in form. A signed-in page whose scripts mention a captcha stays
  signed in; a page from another host is a parse error
- Two earlier decisions were reversed later: the worker now enforces the 30 s manual cooldown (the
  popup reads the same stored time, so it no longer waits for a skipped check), and the popup clock
  ticks every second so the countdown is exact

## Consequences

- Good: no background traffic to Amazon; logout shows immediately and offline
- Good: the worker and the popup stay small; the scanner needs no DOM
- Bad: a server-side logout with the cookie still present shows "Couldn't confirm the session"
  without an email until the cookie changes
- Bad: a new Amazon cookie name would turn every check into `sessionMismatch`. That is the safe
  failure (no email shown), and it is visible in the live smoke
- Measured 2026-10-10: amazon.co.uk and amazon.fr answer the sign-in fetch with a 202 challenge
  while the browser has never visited that site; one normal visit in a tab clears it (the exact
  mechanism is unknown; removing only the `aws-waf-token` cookie did not bring the challenge
  back, removing all of the site's cookies did); .com, .de and .it did not need it. The popup
  tells the user to open the site once, then press Check now
- Note: the CSP `connect-src` allows only the five `www` origins, so a cross-host redirect from
  `/ap/signin` is blocked and surfaces as `network` (retried) rather than `parse` (unverified
  live)
- The popup's failed-start state ("Couldn't start the check") is tracked per marketplace, and only
  the latest request's answer counts. This changed during implementation after a review found a
  failed start on one marketplace leaking into another

## Verification

- Fixture tests on recorded pages (signed in, signed out, challenge), a synthetic unit test for a
  page from another host (`classify.test.ts`), and property tests on the scanner's chunking
- Integration tests of the checker, queue, watcher and router with injected fakes
- The E2E specs (`e2e/`, 8 tests in 3 files): popup render with axe in light and dark mode, a
  failed check keeps the cached email, a cookie removal clears it, a wrong expected account turns
  the popup and the badge red, and the dropdown, every control and the verification link work
  from the keyboard with a visible focus ring
- The manual checklist `docs/live-smoke.md`, with a real account
