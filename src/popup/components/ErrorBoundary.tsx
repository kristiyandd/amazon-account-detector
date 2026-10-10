import { useErrorBoundary } from "preact/hooks";
import { logError } from "@/core/log";
import type { ComponentChildren, JSX } from "preact";

interface ErrorBoundaryProps {
  readonly children: ComponentChildren;
}

function report(error: unknown): void {
  logError("Popup render failed", error);
}

export function ErrorBoundary({ children }: ErrorBoundaryProps): JSX.Element {
  const boundary: [unknown, () => void] = useErrorBoundary(report);
  return boundary[0] === undefined ? (
    <>{children}</>
  ) : (
    <p class="note warn">Something went wrong. Close the popup and open it again.</p>
  );
}
