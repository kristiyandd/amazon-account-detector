import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const POPUP_DIR = "src/popup";
const TOTAL_BYTES_BUDGET = 6000;
const MAX_LINES_PER_FILE = 400;

interface CssFile {
  readonly name: string;
  readonly bytes: number;
  readonly lines: number;
}

async function popupCss(): Promise<readonly CssFile[]> {
  const names = (await readdir(POPUP_DIR)).filter((name) => name.endsWith(".css"));
  return Promise.all(
    names.map(async (name) => {
      const buffer = await readFile(join(POPUP_DIR, name));
      return {
        name,
        bytes: buffer.byteLength,
        lines: buffer.toString("utf8").split("\n").length,
      };
    }),
  );
}

describe("popup CSS budget", () => {
  it("keeps the popup's unminified CSS under 6000 bytes in total, so style growth is noticed", async () => {
    const files = await popupCss();
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    expect(files.length).toBeGreaterThan(0);
    expect(total).toBeLessThan(TOTAL_BYTES_BUDGET);
  });

  it("keeps every popup CSS file under 400 lines, like every other source file", async () => {
    const files = await popupCss();
    const tooLong = files
      .filter((file) => file.lines >= MAX_LINES_PER_FILE)
      .map((file) => file.name);
    expect(tooLong).toEqual([]);
  });
});
