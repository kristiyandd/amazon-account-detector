import { watchDebugFlag } from "@/core/debug-flag";
import { logError } from "@/core/log";
import { createBadgeUpdater } from "./badge";
import { createCheckQueue } from "./check-queue";
import { createChecker } from "./checker";
import { hasSessionCookie } from "./cookies";
import { handleMessage } from "./router";
import { createSessionWatcher } from "./session-watcher";
import { createStore } from "./store";

const POPUP_PATH = "src/popup/index.html";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

watchDebugFlag(chrome.storage.local, chrome.storage.onChanged);
const store = createStore(chrome.storage.session, chrome.storage.local);
const runCheck = createChecker({
  fetch: (input, init) => fetch(input, init),
  store,
  hasSessionCookie: (marketplace) => hasSessionCookie(chrome.cookies, marketplace),
  now: () => Date.now(),
  random: () => Math.random(),
  timeout: (ms) => AbortSignal.timeout(ms),
  sleep,
  subtle: crypto.subtle,
});
const queue = createCheckQueue(runCheck);
const watcher = createSessionWatcher({
  store,
  requestCheck: (id) => {
    void queue.request({ id, manual: false, priority: "cookie" });
  },
  now: () => Date.now(),
  setTimer: (callback, ms) => {
    setTimeout(callback, ms);
  },
});
const popupUrl = chrome.runtime.getURL(POPUP_PATH);
const badge = createBadgeUpdater({
  session: chrome.storage.session,
  local: chrome.storage.local,
  action: chrome.action,
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  sendResponse(
    handleMessage(message, sender, {
      extensionId: chrome.runtime.id,
      popupUrl,
      onCheck: (check) => {
        void queue.request({ id: check.marketplace, manual: check.manual, priority: "popup" });
      },
    }),
  );
});

chrome.cookies.onChanged.addListener((change) => {
  watcher.onChanged(change).catch((error: unknown) => {
    logError("Handling a cookie change failed", error);
  });
});

chrome.storage.onChanged.addListener((changes) => {
  void badge.onChanged(Object.keys(changes));
});

void badge.refresh();
