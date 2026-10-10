import * as v from "valibot";
import { setDebugLogging } from "./log";
import { DEBUG_KEY } from "./state";

export interface DebugArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
}

export interface DebugChanges {
  addListener(
    listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void,
  ): void;
}

function parseDebugFlag(value: unknown): boolean {
  return v.is(v.literal(true), value);
}

export function watchDebugFlag(area: DebugArea, onChanged: DebugChanges): void {
  let changedFirst = false;
  onChanged.addListener((changes, areaName) => {
    const change = changes[DEBUG_KEY];
    if (areaName === "local" && change !== undefined) {
      changedFirst = true;
      setDebugLogging(parseDebugFlag(change.newValue));
    }
  });
  const load = async (): Promise<void> => {
    try {
      const items = await area.get([DEBUG_KEY]);
      if (!changedFirst) {
        setDebugLogging(parseDebugFlag(items[DEBUG_KEY]));
      }
    } catch (_err) {
      setDebugLogging(false);
    }
  };
  void load();
}
