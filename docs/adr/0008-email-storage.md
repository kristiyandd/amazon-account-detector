# ADR-0008: Keep the email in `chrome.storage.session` only

- Status: Accepted
- Date: 2026-10-10

## Context

The detected email is personal data. The popup needs it again the next time it opens, and the
worker may be stopped and restarted between popup opens, so it cannot live in worker memory.
`chrome.storage.session` holds up to 10 MB in memory and is cleared on browser restart and on
extension disable, reload or update (F13 in ADR-0007). `chrome.storage.local` is kept on
disk, unencrypted.

## Considered options

1. **Email in `storage.session`; preferences and throttle in `storage.local`.** No PII on disk
2. **Everything in `storage.local`.** The email is there at once after a restart, but unencrypted
   PII sits on disk
3. **A split with a "signed in, email pending" state.** Keep a signed-in flag on disk and fill the
   email later. About one second gained after a restart, for more states to render and test

## Decision

Option 1. The account state with the email lives only in `chrome.storage.session`, together with
`emailHash`, the SHA-256 of the normalised email. The worker writes and removes the two together,
and the popup and the badge compare `emailHash` with the expected account (ADR-0009) without
hashing again. The selected marketplace, the challenge and manual-check throttle and the debug
flag (no PII) live in `chrome.storage.local`, and so does the expected account, as a hash and a
masked hint only (ADR-0009). Stored blobs are validated with Valibot when read.

## Consequences

- Good: the email never reaches disk and disappears with the browser session (the expected
  account's hash and hint, which the user chooses to store, are the exception, ADR-0009)
- Good: the state machine stays small, with no "pending" state
- Bad: after a browser restart, extension reload or update, the popup shows "Checking…" for about
  a second until the first check fills the state again

## Verification

- `src/background/store.test.ts` checks with fake storage areas that the account state is written
  to the session area and the throttle to the local area; the popup reads the email from the
  session area only
- The E2E seeds state through `chrome.storage`; the live smoke restarts the browser and checks
  "Checking…" followed by the email
