import type { StorageAreaLike } from "@/background/store";

export class FakeArea implements StorageAreaLike {
  data: Record<string, unknown>;
  sets = 0;

  constructor(initial: Record<string, unknown> = {}) {
    this.data = structuredClone(initial);
  }

  get(keys: string[]): Promise<Record<string, unknown>> {
    return Promise.resolve(
      Object.fromEntries(keys.map((key) => [key, structuredClone(this.data[key])])),
    );
  }

  set(items: Record<string, unknown>): Promise<void> {
    this.sets += 1;
    this.data = { ...this.data, ...structuredClone(items) };
    return Promise.resolve();
  }
}
