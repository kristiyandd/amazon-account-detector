# ADR-0003: Least-privilege manifest and a strict CSP

- Status: Accepted; amended by [ADR-0006](0006-session-cookie-host-permissions.md) (wildcard
  hosts, no `alarms`), which also answers the open question below
- Date: 2026-10-10

## Context

The extension reads which Amazon account is signed in, and may store that email. That is
personal data, read from a third-party site with the user's cookies. Every permission and every
relaxed default is something a reviewer, or the Chrome Web Store, will ask about.

## Decision

| Setting                    | Value                                                                                                                                                | Why                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `permissions`              | `storage`, `alarms`, `cookies`                                                                                                                       | cache, background refresh, logout detection, nothing else                                    |
| `host_permissions`         | `https://www.amazon.<tld>/*` for the 5 markets                                                                                                       | the fetch needs them; never `<all_urls>`                                                     |
| `externally_connectable`   | `{ "ids": [] }`                                                                                                                                      | the default lets **every other extension** connect                                           |
| `incognito`                | `"not_allowed"`                                                                                                                                      | the default `spanning` shares `storage.local` with incognito, whose cookie store is separate |
| `web_accessible_resources` | none                                                                                                                                                 | every exposed file makes the extension detectable                                            |
| CSP (`extension_pages`)    | `default-src 'self'; script-src 'self'; connect-src 'self'` + the 5 markets; `object-src`, `base-uri`, `form-action`, `frame-ancestors` all `'none'` | network access only to the five marketplaces; no plugins, no framing                         |
| `minimum_chrome_version`   | `120`                                                                                                                                                | the lowest version with every API used                                                       |

Dev builds additionally allow `localhost:5173` (see ADR-0001); production never does.

Further rules that follow from this decision:

- No `onMessageExternal` listener; incoming messages are validated and checked for
  `sender.id === chrome.runtime.id`
- Amazon HTML is never rendered, only read as text; ESLint bans `innerHTML` and
  `dangerouslySetInnerHTML`
- No real email in the repository: a check fails on any address outside `example.com` /
  `example.org`

## Open question

Session cookies live on `.amazon.<tld>`, while the host permissions cover `www.amazon.<tld>`.
`chrome.cookies.onChanged` may not report them. To be settled by a live capture; if needed, the
hosts widen to `*://*.amazon.<tld>/*`, recorded in a new ADR.

## Consequences

- Good: the permission prompt and the Web Store review have a one-line reason per entry
- Good: any change to permissions or CSP fails the manifest test and needs a deliberate edit
- Bad: the strict CSP forced a separate dev-mode CSP (ADR-0001)

## Verification

The built manifest matches the table; Chromium loads the extension with it (an invalid CSP or key
fails to load); the manifest test asserts the exact permissions, hosts and CSP, and that
production contains no `localhost`.
