# ADR-0002: Three folders with one seam, enforced by lint

- Status: Accepted
- Date: 2026-10-10
- Supersedes: an earlier six-layer ports-and-adapters draft (never implemented)

## Context

The extension is small, about 3 100 lines of product code (tests excluded). It still has logic worth
isolating: the sign-in URL builder, the streaming page scanner and classifier, freshness and backoff
rules, and the service-worker orchestration (deduplication, retries, logout races). That logic must
be testable without Chrome.

The first draft used six layers (`entrypoints`, `shared`, `domain`, `platform`, `app`, `ui`)
with ports and adapters for every `chrome.*` API. An adversarial review judged that a template
rather than a design at this size.

## Decision

Three folders and one seam:

| Folder           | Holds                                                                           | May import | Must not use                                                         |
| ---------------- | ------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `src/core`       | pure logic: marketplaces table, `AccountState`, schemas, URL, parser, freshness | nothing    | `chrome`, `fetch`, `window`, `document`, `localStorage`, `navigator` |
| `src/background` | service worker: listeners, fetch-page, store, checker, queue, session watcher   | `core`     | `window`, `document`, `localStorage`                                 |
| `src/popup`      | Preact UI; talks to the worker only through `popup/api.ts`                      | `core`     | `fetch`, `localStorage`                                              |

The one seam: background use-cases receive their I/O (`fetch`, storage, clock) as parameters.
Tests pass small fakes (`src/test/fake-storage.ts`, a fake `fetch`); no hand-written port
interface per API.

Both columns are enforced by ESLint (`no-restricted-imports`, `no-restricted-globals`), not by
convention. `dependency-cruiser` was dropped: with three folders it duplicates those two rules.

## Consequences

- Good: the parser and state rules are pure functions, so unit and property tests need no browser
- Good: a new marketplace is a row in the marketplaces table; a new detected field extends
  `AccountState`, and the exhaustive-switch lint rule lists every place that must handle it
- Good: an offscreen-document parser, an options page or server sync each fit as one more module
  in an existing folder
- Bad: `background` mixes wiring and orchestration; acceptable at this size (about 770 lines in
  `background`), revisit if it doubles

## Verification

Probe files proved each boundary: `core` using `chrome` / `fetch` / `navigator`, `core`
importing `background` or `popup`, `popup` importing `background` or calling `fetch`, and
`background` using `window`: every one is a lint error.
