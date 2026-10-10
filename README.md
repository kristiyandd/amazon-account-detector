# Amazon Account Detector

A Chrome (Manifest V3) extension. Pick an Amazon marketplace in the toolbar popup to see whether
you are signed in there and with which email. The extension never opens, focuses or navigates any
of your tabs.

It supports amazon.com, amazon.co.uk, amazon.de, amazon.it and amazon.fr.

How it works in detail, the badge colours, the freshness rules, the choice of stack, the
development commands and the release zip are in [docs/guide.md](docs/guide.md).

## Install

You need Chrome 120 or newer.

**Prebuilt (no Node or git needed):**

1. Download `amazon-account-detector-0.1.0.zip` from the
   [Releases page](https://github.com/kristiyandd/amazon-account-detector/releases).
2. Unzip it. On Windows: right-click the file, **Extract All…**, **Extract**. On macOS: double-click
   it. On Linux: `unzip amazon-account-detector-0.1.0.zip -d amazon-account-detector`.
3. The unzipped folder has `manifest.json` directly inside it. Load that folder as described in
   **Load it in Chrome** below.

**From source:** you need Node 24.15 or newer (npm 11 comes with it; `npm ci` refuses older
versions) and git. Clone the repository and build it:

```sh
git clone https://github.com/kristiyandd/amazon-account-detector.git
cd amazon-account-detector
npm ci
npm run build
```

The commands work the same in PowerShell, cmd, Git Bash and macOS/Linux shells. They write the
unpacked extension to `dist/`. You do not need `npm run setup` to use the extension; it only
downloads a browser for the tests.

**Load it in Chrome:**

1. Open `chrome://extensions` and turn on **Developer mode** (the switch at the top right).
2. Click **Load unpacked** and select the folder that contains `manifest.json`: `dist/`, or the
   unzipped release folder.
3. Click the puzzle-piece icon in the Chrome toolbar and pin **Amazon Account Detector**, so its
   icon and badge stay visible.

## Try it

Use the same Chrome profile for the extension and the Amazon tabs. Each marketplace has its own
sign-in, so an amazon.com account is not signed in on amazon.de. The full step-by-step test, with
the expected result of every step, is the [manual test guide](docs/live-smoke.md).

1. **US:** sign in on amazon.com in a tab and click the extension icon. After about a second the
   popup shows a green **Signed in** pill, your email and "Checked just now, at 14:05"; the badge
   shows **US** in green. From an Amazon tab the popup opens on that tab's marketplace; from any
   other tab it opens on the last one you chose (Amazon.com at first).
2. **Not signed in:** in the dropdown, pick Amazon.de or Amazon.it (where you are not signed in).
   The popup shows a grey **Not signed in** pill, "No account is signed in on Amazon.de in this
   browser." and a **Sign in on Amazon.de** link that opens Amazon's sign-in page in a new tab.
3. **DE and IT:** sign in on amazon.de or amazon.it in a tab, then pick it. The popup shows the
   email, as for the US.
4. **UK and FR:** if this profile has never visited the site, Amazon answers the first check with a
   verification challenge: an orange **Verification needed** pill, "Amazon asked for verification.
   Open Amazon.co.uk in a tab once, then press Check now (automatic checks resume after 14:35)."
   and an **Open Amazon.co.uk** link. Click it, let the page load, then press **Check now**.
5. **Sign out** in the amazon.com tab, then open the popup: "Not signed in" at once, because the
   extension sees the session cookie being removed.
6. **Check now** asks again, then stays disabled for 30 s ("Check again in 30 s"), per marketplace,
   even if you close and reopen the popup.
7. **The dropdown** (mouse, or Tab then Enter/ArrowDown/ArrowUp) lists every marketplace with its
   last known state, email, age and a coloured dot, without a new request. Arrows wrap, Home/End
   jump, a letter jumps, Enter or Space chooses, Esc or Tab closes. The line under the card sums up
   all five, for example "2 of 5 marketplaces signed in".
8. **Expected account:** while an email is shown (and the worker stored its hash), press **Set as
   expected** ("Warn me if Amazon.com is ever signed in with a different account."); an **Expected
   account** pill appears. Sign in with a different account there: a red "Wrong account" alert
   names the expected address masked (`o•••s@e•••.com`), offers **Expect this account instead**,
   and the badge turns into a red **!**. With nobody signed in it says "Expected account not signed
   in".
   **Remove** forgets the expected account.
9. **Copy** next to the email copies it; the button shows "Copied" for two seconds, or "Copy
   failed" if Chrome refused.

## How it works

```
popup ──"check us"──► service worker ──fetch (your cookies)──► www.amazon.<tld>/ap/signin
  ▲                        │  reads the email from the page as text, never renders it
  │                        │  cross-checks it with the session cookie (at-main / at-acb<code>)
  └── storage.onChanged ◄──┘  stores the result with the time it was checked
                     cookies.onChanged: sign-out → "not signed in" at once, no request
                                        sign-in or account switch → forget, then re-check
```

It asks Amazon only on popup open, a marketplace change, **Check now** or a session-cookie write,
never by polling ([details](docs/guide.md#how-it-works)).

## Permissions

| Permission                 | Why                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `storage`                  | remember each marketplace's last result, your last pick, the expected account (as a hash) and when the next check may run |
| `cookies`                  | notice a sign-in or sign-out the moment it happens, without a request                                                     |
| `https://*.amazon.<tld>/*` | read the sign-in page and see the session cookie of the five sites, and see whether the active tab is one of them         |

The toolbar badge, the clipboard copy, the expected account and opening on the active tab's
marketplace need no further permission: Chrome shows the extension a tab's address only for the
five Amazon sites.

Chrome describes the host permission as access to your data on the Amazon sites. The code never
reads a cookie's value (a lint rule forbids `.value` reads in `src/`; the one exception is a
stream chunk in `fetch-page.ts`), and the content security policy lets the extension send
requests only to the five `www.amazon.<tld>` sites. Other extensions cannot talk to it, and it
does not run in incognito ([ADR-0003](docs/adr/0003-least-privilege-manifest.md),
[ADR-0006](docs/adr/0006-session-cookie-host-permissions.md)).

## Privacy

The extension reads only your own session, only the sign-in page of the marketplace being checked,
only when there is a reason (above), and scrapes nothing else. It never sends your email anywhere:
there is no server, no analytics and no remote code. The email (and its SHA-256 hash, used to
compare it with the expected account) is kept only in Chrome's in-memory session storage and is
gone when the browser closes ([ADR-0008](docs/adr/0008-email-storage.md)). Two things go beyond
that memory, and only when you act:

- **Set as expected** writes an unsalted SHA-256 hash of the email and a masked hint such as
  `o•••s@e•••.com` to disk (`chrome.storage.local`). A local part of three characters or fewer
  becomes `•`, and every part of the domain except the last is masked. This keeps the address out
  of plain sight, but it is not secret: someone who can read your Chrome profile can test guesses
  against the hash ([ADR-0009](docs/adr/0009-expected-account-storage.md)).
- **Copy** puts the email on the system clipboard, where clipboard history or sync may keep it.

## Testing

`npm run check` (after `npm run setup` once) runs every gate: formatting, two strict TypeScript
programs, ESLint with zero warnings, unused-code detection, unit and component tests with coverage
thresholds (the parser is tested on real, anonymised Amazon pages), the build, end-to-end tests of
the built extension with an accessibility scan in light and dark mode, a scan for real email
addresses, and `npm audit` of all dependencies with a signature check
([ADR-0004](docs/adr/0004-toolchain-and-quality-gates.md)). Before a release, the
[manual test guide](docs/live-smoke.md) is run against the live sites. Debug logging:
[docs/debugging.md](docs/debugging.md).

## Known gaps

- A sign-out done on Amazon's servers ("sign out everywhere") while the cookie stays in this
  browser shows "Couldn't confirm the session" (without the email) until the cookie changes
- On the European sites the session-cookie name is assumed to follow the `at-acb<code>` pattern
  seen in public samples (`at-main` on amazon.com is measured); a different name would show
  "Couldn't confirm the session" instead of the email
- With third-party cookies blocked in Chrome, checks may show "Couldn't confirm the session"
- amazon.co.uk and amazon.fr answer with a verification challenge until the browser has visited
  the site once in a tab (measured 2026-10-10; .com, .de and .it did not need it; the Amazon-side
  mechanism is unknown, and it is not the `aws-waf-token` cookie alone)
- Waking a stopped service worker is checked by hand, not by an automated test

## Decisions

The reasoning behind each choice is recorded as an ADR in [docs/adr](docs/adr/README.md):

- [0001](docs/adr/0001-build-tooling.md) build tooling
- [0002](docs/adr/0002-architecture.md) architecture
- [0003](docs/adr/0003-least-privilege-manifest.md) least-privilege manifest
- [0004](docs/adr/0004-toolchain-and-quality-gates.md) toolchain and quality gates
- [0005](docs/adr/0005-marketplace-signin-parameters.md) sign-in parameters per marketplace
- [0006](docs/adr/0006-session-cookie-host-permissions.md) wildcard host permissions
- [0007](docs/adr/0007-detection-approach.md) detection approach
- [0008](docs/adr/0008-email-storage.md) where the email is stored
- [0009](docs/adr/0009-expected-account-storage.md) how the expected account is stored

## With more time

- More marketplaces (each needs its sign-in parameter measured live, ADR-0005)
- A "Check all" button and a link to the orders page
- An offscreen-document parser as a fallback
- Mutation testing, type coverage, duplication and bundle-size budgets, performance budgets
- CodeQL and secret scanning in CI
