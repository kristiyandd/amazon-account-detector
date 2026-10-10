# ADR-0009: Store the expected account as a hash and a masked hint

- Status: Accepted
- Date: 2026-10-10

## Context

Users who order for a business want a warning when a marketplace is signed in with the wrong
account. The extension has to remember, per marketplace, which account is expected, also after
a browser restart, so `chrome.storage.session` is not enough. `chrome.storage.local` is kept on
disk, unencrypted, and ADR-0008 keeps the email out of persistent storage. The worker needs the
comparison for the toolbar badge while the popup is closed.

## Considered options

1. **SHA-256 hash of the normalised email plus a masked hint in `storage.local`.** The worker
   hashes the current email (`crypto.subtle`) when it stores a check result, and the popup and
   the badge compare that hash with the expected one
2. **The plain email in `storage.local`.** Simplest comparison and display, but unencrypted PII on
   disk, against ADR-0008
3. **The user types the expected address.** Nothing taken from the page, but typing is
   error-prone, and the typed address would still need storing

## Decision

Option 1. `storage.local` key `expected` holds
`{ schemaVersion: 1, byMarketplace: { <id>: { hash, hint } } }`. `hash` is the lower-case SHA-256
hex of the trimmed, lower-cased email. `hint` keeps only enough to recognise the account:

- a local part longer than three characters keeps its first and last character
  (`orders.us` → `o•••s`); one of three characters or fewer becomes `•`
- every domain label except the last becomes its first character plus `•••` (`example` →
  `e•••`; a one-character label becomes `•`)
- examples: `orders.us@example.com` → `o•••s@e•••.com`, `ab@example.org` → `•@e•••.org`

The expected account is set with one click from the account signed in now: the popup copies the
`emailHash` the worker stored with that account (ADR-0008) and stores the masked email.
**Remove** deletes it again. `src/core/expected.ts` holds the pure parts (`normalizeEmail`,
`maskEmail`, `hashEmail` with `SubtleCrypto` as a parameter, `matchStatus`); the blob is
validated with Valibot like every other stored value.

## Consequences

- Good: no plain email on disk; the hint is enough for the user to recognise the expected
  account
- Good: the worker can compare and set the badge with the popup closed
- Bad: this is obfuscation, not protection. `storage.local` is an unencrypted file in the Chrome
  profile, and the hash is unsalted and fast. Anyone who can read the profile (another local
  user, malware, a backup or a copied profile) can test guesses, and the hint narrows them: it
  gives the TLD, the first character of each domain label and, for longer local parts, the first
  and last character. Common addresses and addresses from breach lists are found quickly. The
  design keeps the address out of plain sight, not away from a determined local attacker
- Bad: the popup cannot show the full expected address, only the hint
- Considered and not done: a per-install salt (stops precomputed lookups and linking the same
  account across installs, but not an attacker who has the whole profile) and not storing a
  hint at all (the alert would say only "the expected account")

## Verification

- `src/core/expected.test.ts`: normalisation is idempotent; local parts of one to three
  characters are masked completely; masking never reveals the whole local part or any whole
  domain label except the TLD (fast-check, local parts of 1 to 30 characters, 2 to 5 labels);
  hashing ignores case and surrounding spaces; every match status
- `src/core/state.test.ts`: the stored blob holds only the hash and the hint, and a non-hex hash
  is discarded; `src/popup/api.test.ts`: setting or clearing one marketplace's expected account
  keeps the others
- `e2e/popup.spec.ts`: setting the expected account and then seeding another email shows the red
  alert and the badge text `!`; the live smoke checks the stored blob by hand
