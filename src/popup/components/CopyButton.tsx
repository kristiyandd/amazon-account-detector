import { useCallback, useEffect, useState } from "preact/hooks";
import { COPY_ICON, TICK_ICON } from "./icons";
import type { JSX } from "preact";

type CopyState = "idle" | "copied" | "failed";

const RESET_MS = 2000;
const LABELS: Readonly<Record<CopyState, string>> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};
const NAMES: Readonly<Record<CopyState, string>> = {
  idle: "Copy email",
  copied: "Email copied",
  failed: "Copy failed",
};

interface CopyButtonProps {
  readonly email: string;
}

export function CopyButton({ email }: CopyButtonProps): JSX.Element {
  const [state, setState] = useState<CopyState>("idle");
  useEffect(() => {
    if (state === "idle") {
      return;
    }
    const timer = setTimeout(() => {
      setState("idle");
    }, RESET_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);
  const handleClick = useCallback((): void => {
    const copy = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(email);
        setState("copied");
      } catch (_err) {
        setState("failed");
      }
    };
    void copy();
  }, [email]);
  return (
    <button
      type="button"
      class={state === "copied" ? "icon-btn done" : "icon-btn"}
      aria-label={NAMES[state]}
      onClick={handleClick}
    >
      {state === "copied" ? TICK_ICON : COPY_ICON}
      {LABELS[state]}
    </button>
  );
}
