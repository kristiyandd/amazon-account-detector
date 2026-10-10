import { render } from "preact";
import { watchDebugLogging } from "./api";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

watchDebugLogging();
const root = document.querySelector("#app");
if (root !== null) {
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    root,
  );
}
