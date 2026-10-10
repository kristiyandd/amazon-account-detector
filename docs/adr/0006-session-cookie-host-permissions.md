# ADR-0006: Wildcard Amazon host permissions to watch the session cookie, no `alarms`

- Status: Accepted
- Date: 2026-10-10
- Amends: ADR-0003 (host permissions, `alarms`; answers its open question)

## Context

The brief requires that the popup stops showing an email once the session ends. The design detects
logout from `chrome.cookies.onChanged` instead of polling Amazon.

ADR-0003 granted `https://www.amazon.<tld>/*` and left open whether that is enough to see the
session cookies. A live capture with a real account (2026-10-10) settled it:

- Every session cookie (`at-main`, `sess-at-main`, `x-main`, `sso-state-main`) has the domain
  `.amazon.com`
- With `https://www.amazon.com/*`, `chrome.cookies.getAll({ url })` returned only two host-only
  cookies (`id_pk`, `id_pkel`); `chrome.cookies.get({ name: "at-main" })` found nothing
- With `https://*.amazon.com/*`, all of them were visible, and `onChanged` reported login
  (`at-main` added, cause `explicit`) and logout (`at-main` removed, cause `expired_overwrite`)
- The sign-in `fetch` worked with either permission; only the cookies API needs the wider one

## Considered options

1. **`https://*.amazon.<tld>/*` for the five markets**: the cookies API sees the session
   cookies; logout is detected at once, without network traffic
2. **Keep `www` only, poll instead**: re-fetch the sign-in page every N minutes to notice a
   logout. A stale email stays visible for up to N minutes, and Amazon is hit around the clock;
   the capture already saw 202 challenges for low-volume requests
3. **Keep `www` only, check only when the popup opens**: the cached email is wrong between a
   logout and the next popup open, which the brief rules out

## Decision

Option 1. `host_permissions` become `https://*.amazon.com/*`, `https://*.amazon.co.uk/*`,
`https://*.amazon.de/*`, `https://*.amazon.it/*`, `https://*.amazon.fr/*`.

Because there is no polling, `alarms` has no use (the challenge backoff is a stored timestamp
checked when the popup opens) and is removed. `permissions` become `storage`, `cookies`.

The CSP `connect-src` stays at the five `https://www.amazon.<tld>` origins: the wider host
permission is for the cookies API only, never for requests to other subdomains.

## Consequences

- Good: logout is reflected immediately and offline; no background traffic to Amazon at all
- Good: one permission fewer (`alarms`)
- Bad: the install prompt now covers all sites under each Amazon domain, and the extension could
  read the HttpOnly session cookies of every Amazon subdomain. Mitigations:
  - only `session-cookie.ts`, `cookies.ts`, `session-watcher.ts` and `index.ts` touch cookies,
    and a lint rule bans reading `value` (dotted, computed, and destructured with a plain, quoted
    or computed key) in every file under `src/`, tests included. The one exception applies only
    to `fetch-page.ts`: destructuring the chunk of a stream reader
    (`const { done, value } = await reader.read()`). Lint does not know types, so another file
    that calls a method named `read` gets no exception. The code uses name,
    domain, store, `removed` and `cause` only
  - nothing is sent anywhere but `fetch` to the five `www` origins (CSP `connect-src`)
  - no content scripts, no external messaging, two runtime dependencies, signed and age-gated
- Neutral: the cookie names for the EU markets were not captured; the watcher matches
  `^at-(main|acb[a-z]{2})$` on each market's cookie domain

## Verification

- Live: the two experiments above, run from an installed copy of `dist/` with each permission
  set (the probe extension was removed afterwards)
- The manifest test asserts the exact new hosts, `permissions: ["storage", "cookies"]`, and an
  unchanged `connect-src`
