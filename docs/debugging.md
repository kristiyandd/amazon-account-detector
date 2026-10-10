# Debugging

Debug logging is off by default. When it is on, the extension prints one short line per step
(queue, fetch attempts, classification, cookie events, popup decisions) with the prefix
`[account-detector]`.

- **Turn it on:** open `chrome://extensions`, click the extension's "service worker" link and
  run `chrome.storage.local.set({ debug: true })` in its console. The popup's DevTools console
  (right-click the popup, then Inspect) accepts the same command.
- **Turn it off:** `chrome.storage.local.set({ debug: false })`.
- **Where the lines appear:** the service-worker console (queue, checks, cookies, messages) and
  the popup console (open, check decisions). Both pick the flag up live.
- The first lines after the service worker starts can be missing, because the flag is read
  from storage asynchronously.
- The lines never contain cookie values, page HTML or a full email address. Addresses are
  masked (`t***@example.com`).

Useful lines when something looks wrong:

- `check us: skipped (manual cooldown, … ms left)`: **Check now** was pressed again within 30 s
- `check uk: skipped (throttled until …)`: an automatic check waits after a verification
  challenge
- `cookie: check de scheduled in … ms`: a session-cookie write; the check runs after a 500 ms
  debounce, or at the end of the 20-second window if a cookie-triggered check ran less than 20 s ago
- `popup: us fresh → no check`: the last successful check is under a minute old

To inspect the stored state, run `chrome.storage.session.get()` (account state with the email)
or `chrome.storage.local.get()` (last pick, throttle, expected account, debug flag) in the
service-worker console.
