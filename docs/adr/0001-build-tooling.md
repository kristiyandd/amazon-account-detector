# ADR-0001: Vite + CRXJS + Preact, with the manifest in code

- Status: Accepted
- Date: 2026-10-10

## Context

The brief asks for a Chrome MV3 extension that loads unpacked, with "whatever libraries or
tooling you prefer", and the choices must be defensible in a follow-up interview. The extension
has two entry points: a background service worker and a small popup: a marketplace dropdown
(a keyboard-driven listbox), a status card with some ten states (checking, signed in, signed in
without an email, signed out, last known, verification needed, errors, wrong account, expected
account not signed in), an expected-account control and a copy button.

## Decision drivers

- A reviewer should see the manifest and the build without learning a framework's conventions
- The popup renders about ten states; they should be declarative and testable
- Small output, so the popup opens instantly
- A maintained, current toolchain

## Considered options

1. **Vite 8 + `@crxjs/vite-plugin` 3 + Preact 10**
2. WXT 0.21 (opinionated extension framework, file-based entry points, built-in zip)
3. Plain Vite multi-entry build + a static `manifest.json`
4. Vanilla TypeScript for the popup (no UI library)
5. Vanilla JavaScript with a hand-written `manifest.json` and no build step

## Decision

Option 1. The manifest is TypeScript (`manifest.config.ts`, `buildManifest(mode)`) so it is
typed, testable, and the single place where permissions and the CSP live.

- **CRXJS over WXT**: stays plain Vite: one plugin, no framework conventions to explain. WXT is
  still pre-1.0 and abstracts the manifest away, which is the part reviewers most want to read.
- **CRXJS over plain Vite**: typed manifest, correct MV3 service-worker output and a working dev
  loop, at the cost of one plugin.
- **Preact over vanilla TS**: Preact and its hooks add about 6 kB gzip; the whole popup (JS,
  CSS and HTML) is about 18 kB gzip. With components, each state is a function of the stored
  snapshot and has a component test. Vanilla TS would remove one runtime dependency and those
  6 kB, but every state change would be a hand-written DOM update, the usual source of a stale
  email left on screen.
- **This stack over vanilla JavaScript without a build** (option 5): vanilla JS would work. The
  UI is small enough to write by hand, and a reviewer could load the folder straight from a
  clone. It was rejected because of what the stack buys:
  - types on the three places where data comes from outside the code: `chrome.storage`, the
    popup-to-worker messages and the Amazon page; Valibot parses each of them at run time, so a
    corrupt blob or an unexpected page becomes a typed error, not a crash
  - a pure `core` (parser, classifier, freshness, backoff, popup copy) and a worker whose
    `fetch`, storage and clock are parameters, so the races (a logout during a check, rapid
    marketplace switching, cookie storms) are tested deterministically with fake timers
  - Preact for the keyboard-driven listbox and the popup states (above)
  - the manifest as code (`buildManifest(mode)`): one source for permissions and the CSP, with a
    dev CSP that allows the Vite server and a production CSP that never does, both asserted by a
    test
- **Costs accepted** (they are real):
  - a fresh clone cannot be loaded until `npm ci` and `npm run build` have run; the release zip
    covers reviewers who do not want to build
  - about 350 packages are installed for the build and the tests (pinned, at least 7 days old,
    signatures verified, ADR-0004), against none for vanilla
  - Node 24.15 or newer is required to build
  - `@crxjs/vite-plugin` 3 is a fresh major (see Consequences)
  - `npm run check` takes about 1.5 minutes on a fresh clone
  - more ceremony than the job strictly needs: a vanilla version would take about a day; this
    one has a build config, two TypeScript programs and a lint setup to explain
- **Preact 10, not 11**: 11.0 shipped days before this decision; 10 is the stable line, and
  the component tests use its own `preact/test-utils`, so no third-party test library pins it.

## Consequences

- Good: `vite build` produces a loadable `dist/` in under a second; the manifest is covered by a
  unit test (exact permissions, hosts, CSP, keys).
- Bad: `@crxjs/vite-plugin` 3.0.0 was a fresh major (published 2026-09-24). Mitigated by the
  E2E test that loads the built extension in Chromium on every check.
- Bad: a clone is not loadable until built. The README gives `npm ci` and `npm run build`, and
  the repository owner can attach a prebuilt zip to a GitHub Release (`docs/guide.md` shows how to
  build it).
- Bad: the other costs listed under Decision (about 350 dev packages, Node 24.15, a slower full
  check, more setup to explain than a vanilla version).

## Dev mode

CRXJS dev mode loads code from the Vite server, which the strict production CSP blocks. It also
failed because Vite listened only on `::1` while Chromium connects to `127.0.0.1`. Resolution:

- `buildManifest("development")` adds `http://localhost:5173` / `ws://localhost:5173` and
  inline styles; production never does (asserted by a test)
- `server.host = "127.0.0.1"`, `strictPort`, `hmr.port = 5173`

## Verification

- `npm run build` + Playwright loads `dist/`, the service worker registers, the popup renders,
  0 axe violations
- Dev server + Chromium: popup renders from the dev server with 0 console or CSP errors
