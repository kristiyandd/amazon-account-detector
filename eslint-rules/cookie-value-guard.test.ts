import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const LINT_TIMEOUT_MS = 60_000;

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "");
}

describe("cookie value guard", () => {
  it(
    "forbids reading a cookie's value where the cookies API is used",
    async () => {
      const code =
        "export function leak(cookie: { value: string }): string {\n  return cookie.value;\n}\n";
      expect(await ruleIds(code, "src/background/cookies.ts")).toContain("no-restricted-syntax");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "forbids destructuring the value too",
    async () => {
      const code =
        "export function leak({ value }: { value: string }): string {\n  return value;\n}\n";
      expect(await ruleIds(code, "src/core/session-cookie.ts")).toContain("no-restricted-syntax");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    'forbids computed access too, so cookie["value"] is not a way around the rule',
    async () => {
      const code =
        'export function leak(cookie: { value: string }): string {\n  return cookie["value"];\n}\n';
      expect(await ruleIds(code, "src/background/session-watcher.ts")).toContain(
        "no-restricted-syntax",
      );
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "covers every source file, so a new file such as badge.ts cannot read a cookie's value",
    async () => {
      const code = [
        "export async function leak(): Promise<string> {",
        '  const c = await chrome.cookies.get({ url: "https://www.amazon.com/", name: "at-main" });',
        '  return c === null ? "" : c.value;',
        "}",
        "",
      ].join("\n");
      expect(await ruleIds(code, "src/background/badge.ts")).toContain("no-restricted-syntax");
      expect(await ruleIds(code, "src/popup/components/Summary.tsx")).toContain(
        "no-restricted-syntax",
      );
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "keeps the stream-chunk exception inside fetch-page.ts, so another file cannot destructure await x.read()",
    async () => {
      const code = [
        "export async function leak(store: { read: () => Promise<{ value: string }> }): Promise<string> {",
        "  const { value } = await store.read();",
        "  return value;",
        "}",
        "",
      ].join("\n");
      expect(await ruleIds(code, "src/background/badge.ts")).toContain("no-restricted-syntax");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "forbids quoted and computed keys when destructuring, in every file including fetch-page.ts",
    async () => {
      const quoted =
        'export function leak(cookie: { value: string }): string {\n  const { "value": v } = cookie;\n  return v;\n}\n';
      const computed =
        'export function leak(cookie: { value: string }): string {\n  const { ["value"]: v } = cookie;\n  return v;\n}\n';
      for (const file of ["src/background/badge.ts", "src/background/fetch-page.ts"]) {
        expect(await ruleIds(quoted, file)).toContain("no-restricted-syntax");
        expect(await ruleIds(computed, file)).toContain("no-restricted-syntax");
      }
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "lets a stream reader's chunk be destructured, the one place a value is read",
    async () => {
      const code = [
        "export async function next(",
        "  reader: ReadableStreamDefaultReader<Uint8Array>,",
        "): Promise<number> {",
        "  const { done, value } = await reader.read();",
        "  return done ? 0 : value.byteLength;",
        "}",
        "",
      ].join("\n");
      expect(await ruleIds(code, "src/background/fetch-page.ts")).not.toContain(
        "no-restricted-syntax",
      );
    },
    LINT_TIMEOUT_MS,
  );
});
