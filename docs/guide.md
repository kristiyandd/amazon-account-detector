# Design decisions and details

The [README](../README.md) covers installing and trying the extension. This page holds the rest:
how it works, what the badge and the freshness texts mean, why this stack, and the development
commands.

## How it works

The data-flow diagram is in the [README](../README.md#how-it-works).

- `src/core`: pure logic (marketplaces, parsing, state rules, popup text), no browser APIs
- `src/background`: the service worker, the extension's background script that Chrome starts when
  needed and stops when idle. It fetches, stores, runs the checks and watches the session cookie
- `src/popup`: the Preact popup. It never calls the network, only the service worker

**Why this way:** a request from the service worker never touches a tab, needs no extra
permission and returns the email in about a second. A hidden tab or an offscreen document would
load the whole page with its scripts, and polling would hit Amazon around the clock
([ADR-0007](adr/0007-detection-approach.md)). The brief's sign-in URL works only with each
site's own `openid.assoc_handle` (`usflex`, `gbflex`, `deflex`, `itflex`, `frflex`). With `usflex`
the European sites answered with a 404 or a verification page
([ADR-0005](adr/0005-marketplace-signin-parameters.md), measured live).

The extension asks Amazon only when there is a reason: you open the popup or choose a marketplace
(unless its last successful check is under a minute old), you press **Check now** (at most once
per 30 s per marketplace), or the session cookie of a marketplace was just written (at most one
check per 20 s per marketplace; a later write waits for the end of those 20 s, short enough to run
before Chrome stops the idle service worker). There is no background polling. After a
verification challenge, automatic checks pause for 15 to 30 minutes, and longer after each
further challenge (up to 6 hours).

## The toolbar badge

The popup opens on the marketplace of the active tab when that tab is one of the five Amazon
sites, and saves it as the selected one; on any other tab it opens on the last marketplace you
chose. The badge always follows the marketplace selected in the popup:

| Badge          | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| code in green  | signed in                                                          |
| code in grey   | not signed in                                                      |
| code in orange | Amazon asked for verification, or asked the extension to slow down |
| red **!**      | the expected account is not the one signed in, or nobody is        |
| no text        | nothing known yet                                                  |

## How fresh is it?

Every result shows when it was checked ("Checked 2 min ago, at 14:05"), and the age updates while
the popup is open. A result less than a minute old is shown without asking Amazon again. An older
one is shown at once and checked again. When a check fails, the popup keeps the last result and
says why, for example "Couldn't reach Amazon. Showing the result from 12 min ago." A signed-in
result that failed to refresh, or is older than 24 hours, gets an orange **Last known** pill
instead of **Signed in**; after 24 hours it also gets the warning "Checked 1 d ago. This may be
out of date; press Check now." A sign-out never waits for a check: the email disappears as soon
as the session cookie is removed.

## Why this stack

TypeScript, Preact 10, Vite 8 with the CRXJS plugin, and Valibot for runtime checks. A plain
JavaScript extension with a hand-written `manifest.json` would also work, and it would load without
a build step. The trade-off:

|                                                    | This stack                                                                                              | Vanilla JS, no build                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Load from a fresh clone                            | `npm ci` and `npm run build` first (or the release zip)                                                 | load the folder as it is                 |
| Data from Amazon and storage                       | typed, and parsed with Valibot at every boundary                                                        | unchecked objects                        |
| Popup (some ten states, keyboard dropdown, alerts) | components, each state tested in jsdom with `preact/test-utils`                                         | hand-written DOM updates                 |
| Logic tests                                        | pure `core` plus injected fetch, storage and clock; races tested deterministically                      | possible, but nothing enforces the split |
| Manifest                                           | `manifest.config.ts`, one typed source with dev and production CSP, and a test of the exact permissions | hand-edited JSON                         |
| Size                                               | popup about 18 kB gzip, Preact about 6 kB of it                                                         | about 6 kB less                          |
| Dependencies                                       | 2 at runtime, about 350 packages for build and tests, Node 24                                           | none                                     |
| Full check                                         | `npm run check` takes about 1.5 minutes                                                                 | faster, with fewer checks                |

Details, the rejected options (WXT, plain Vite, vanilla) and the costs are in
[ADR-0001](adr/0001-build-tooling.md). TypeScript, lint and version pinning are in
[ADR-0004](adr/0004-toolchain-and-quality-gates.md).

### If the extension grows

The stack costs about the same whatever the extension's size: the setup is done once. Hand-written
code costs more with every feature. For a single marketplace on one screen, plain JavaScript would
be enough. The likely next steps for a dropshipping team change that:

| Next step                                   | With this stack                                                                                                                                                        | With vanilla JS                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| More marketplaces (.es, .ca, .co.jp, …)     | a row in the marketplaces table, keys in the three storage schemas and a suffix in `manifest.config.ts`; the compiler points at the code that handles each marketplace | find every place that names a marketplace by hand           |
| "Check all"                                 | the check queue, throttle and backoff already exist and are tested; it adds a button                                                                                   | write request pacing again, or risk Amazon's verification   |
| More expected accounts (one per store)      | the Valibot schema changes, and old stored data is rejected instead of breaking the popup                                                                              | old data in storage breaks the new code without an error    |
| An options page                             | another Preact page with the same components, schemas and tests                                                                                                        | a second hand-written DOM layer                             |
| A warning on Amazon itself (content script) | `src/core` has no browser APIs, so the same logic runs there unchanged                                                                                                 | the logic is tied to the popup and has to be copied         |
| Several developers                          | types, lint rules (no `innerHTML`, no cookie values) and gates hold for everyone                                                                                       | depends on each person's discipline and on review           |
| Publishing in the Chrome Web Store          | the manifest test stops an extra permission from shipping by accident                                                                                                  | a stray permission means a rejected update or a new warning |

Growing further would also need what this take-home leaves out: a git repository with CI and
pre-commit hooks, translations (most popup texts are built in `src/core/view.ts` and
`src/core/overview.ts`; the rest sit in the components), the "With more time" gates from the README,
and a new privacy decision (an ADR) before any data leaves the browser.

## Development

| Command                 | What it does                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run setup`         | downloads Playwright's Chromium, once, before `npm run e2e` or `npm run check` (tests only)                                 |
| `npm run dev`           | Vite dev server with hot reload; load `dist/` once. Run `npm run build` again before using the extension without the server |
| `npm test`              | unit and component tests                                                                                                    |
| `npm run test:coverage` | tests with coverage thresholds                                                                                              |
| `npm run e2e`           | after `npm run build` and `npm run setup`: loads `dist/` in Chromium and drives the popup                                   |
| `npm run check`         | every quality gate (needs `npm run setup` once)                                                                             |

Debug logging is off by default; [debugging.md](debugging.md) shows how to turn it on.

## Release zip

On Windows 10 or newer, in PowerShell or cmd (Git Bash's `tar` cannot write a zip), use the
version from `package.json` in the file name:

```sh
npm run build
cd dist
tar -a -c -f ../amazon-account-detector-0.1.0.zip *
cd ..
```

The zip holds the contents of `dist/`, with `manifest.json` at the top. The repository owner
attaches it to a GitHub Release. Rebuild it from the current source for every release.
