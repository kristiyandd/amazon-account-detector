import { render } from "preact";
import { watchDebugFlag } from "@/core/debug-flag";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

watchDebugFlag(chrome.storage.local, chrome.storage.onChanged);
const root = document.querySelector("#app");
if (root !== null) {
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    root,
  );
}
