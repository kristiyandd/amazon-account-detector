import { vi } from "vitest";
import { setDebugLogging } from "@/core/log";

export interface DebugCapture {
  readonly lines: () => readonly string[];
  readonly stop: () => void;
}

export function captureDebug(): DebugCapture {
  const spy = vi.spyOn(console, "debug").mockReturnValue(undefined);
  setDebugLogging(true);
  return {
    lines: () => spy.mock.calls.map((call) => String(call[0])),
    stop: () => {
      setDebugLogging(false);
      spy.mockRestore();
    },
  };
}
