import { isUtf8 } from "node:buffer";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type FileKind = "text" | "maybe" | "image" | "skip";

const EMAIL = /[\w%+.-]+@(?:[\w-]+\.)+[a-z]{2,}\b/giu;
const ENCODED_AT = /&#(?:64|x40);|%40/giu;
const ALLOWED_DOMAINS = new Set(["example.com", "example.org"]);
const SKIPPED_DIRECTORIES = new Set([
  ".captures",
  ".git",
  ".idea",
  ".state",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const SKIPPED_FILES = new Set(["package-lock.json"]);
const TEXT_FILE =
  /\.(?:c?css|cjs|cts|csv|har|html|jsonc?|md|mjs|js|mts|svg|ts|tsx|txt|xml|ya?ml)$/iu;
const IMAGE_FILE = /\.(?:avif|bmp|gif|ico|jpe?g|png|tiff?|webp)$/iu;
const ALLOWED_IMAGE = /^public\/icons\/icon-\d+\.png$/u;

function domainOf(email: string): string {
  return (email.split("@").at(-1) ?? "").toLowerCase();
}

export function findRealEmails(text: string): string[] {
  return [...text.replaceAll(ENCODED_AT, "@").matchAll(EMAIL)]
    .map((match) => match[0])
    .filter((email) => !ALLOWED_DOMAINS.has(domainOf(email)));
}

export function fileKind(name: string): FileKind {
  if (TEXT_FILE.test(name)) {
    return "text";
  }
  if (IMAGE_FILE.test(name)) {
    return "image";
  }
  return path.extname(name) === "" ? "maybe" : "skip";
}

export function readText(content: Buffer): string | null {
  return isUtf8(content) ? content.toString("utf8") : null;
}

export function disallowedImages(relativePaths: readonly string[]): string[] {
  return relativePaths.filter((file) => !ALLOWED_IMAGE.test(file.replaceAll("\\", "/")));
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listFiles(fullPath);
    }
    return SKIPPED_FILES.has(entry.name) ? [] : [fullPath];
  });
}

function contentOf(file: string): string | null {
  const content = readFileSync(file);
  return fileKind(path.basename(file)) === "text" ? content.toString("utf8") : readText(content);
}

function emailHits(root: string, files: readonly string[]): string[] {
  return files.flatMap((file) => {
    const text = contentOf(file);
    return text === null
      ? []
      : findRealEmails(text).map((email) => `${path.relative(root, file)}: ${email}`);
  });
}

if (import.meta.main) {
  const root = process.cwd();
  const files = listFiles(root);
  const scanned = files.filter((file) => {
    const kind = fileKind(path.basename(file));
    return kind === "text" || kind === "maybe";
  });
  const images = files
    .filter((file) => fileKind(path.basename(file)) === "image")
    .map((file) => path.relative(root, file));
  const hits = emailHits(root, scanned);
  const badImages = disallowedImages(images);
  if (hits.length > 0) {
    console.error(`Real email addresses found — use example.com instead:\n${hits.join("\n")}`);
    process.exitCode = 1;
  }
  if (badImages.length > 0) {
    console.error(`Images other than the generated icons found:\n${badImages.join("\n")}`);
    process.exitCode = 1;
  }
}
