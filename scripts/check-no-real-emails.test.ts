import { describe, expect, it } from "vitest";
import { disallowedImages, fileKind, findRealEmails, readText } from "./check-no-real-emails.ts";

const address = (local: string, domain: string): string => [local, domain].join("@");

describe("findRealEmails", () => {
  it("ignores the example.com addresses fixtures are required to use", () => {
    expect(findRealEmails(`signed in as ${address("test.user", "example.com")}`)).toEqual([]);
  });

  it("reports a real address so personal data never reaches the repository", () => {
    const real = address("jane.doe+shop", "gmail.com");
    expect(findRealEmails(`<span>${real}</span>`)).toEqual([real]);
  });

  it("checks the domain case-insensitively so EXAMPLE.COM is still allowed", () => {
    const real = address("x", "corp.co.uk");
    expect(findRealEmails(`${address("USER", "EXAMPLE.COM")} and ${real}`)).toEqual([real]);
  });

  it("does not mistake a pinned package version for an address", () => {
    expect(findRealEmails("npx chrome-devtools-mcp@1.10.1 and vite@8.3.2")).toEqual([]);
  });

  it("decodes &#64;, &#x40; and %40 first, the forms raw Amazon HTML and URLs use", () => {
    const encoded = [
      ["jane", "corp.net"].join("&#64;"),
      ["JOE", "corp.net"].join("&#X40;"),
      ["ann", "corp.net"].join("%40"),
    ].join(", ");
    expect(findRealEmails(encoded)).toEqual([
      address("jane", "corp.net"),
      address("JOE", "corp.net"),
      address("ann", "corp.net"),
    ]);
    expect(findRealEmails("test.user&#64;example.com")).toEqual([]);
  });
});

describe("fileKind", () => {
  it("scans the text formats that can carry an address", () => {
    const names = ["a.svg", "a.cjs", "a.cts", "a.jsonc", "a.csv", "a.har", "a.xml", "a.ts", "a.md"];
    expect(names.map(fileKind)).toEqual(names.map(() => "text"));
  });

  it("treats extensionless files and dotfiles as possible text", () => {
    expect(["LICENSE", ".npmrc", ".env"].map(fileKind)).toEqual(["maybe", "maybe", "maybe"]);
  });

  it("recognises raster images and skips other binaries", () => {
    expect(
      ["shot.PNG", "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.ico", "a.avif"].map(fileKind),
    ).toEqual(["image", "image", "image", "image", "image", "image", "image"]);
    expect(fileKind("release.zip")).toBe("skip");
  });
});

describe("readText", () => {
  it("reads a UTF-8 file and refuses a binary one", () => {
    expect(readText(Buffer.from("registry=https://example.org\n", "utf8"))).toBe(
      "registry=https://example.org\n",
    );
    expect(readText(Buffer.from([0xff, 0xfe, 0x00, 0x81]))).toBeNull();
  });
});

describe("disallowedImages", () => {
  it("allows only the generated toolbar icons, since pixels can show an address no scan sees", () => {
    expect(
      disallowedImages([
        "public/icons/icon-16.png",
        String.raw`public\icons\icon-128.png`,
        "docs/screenshot.png",
        "public/icons/logo.png",
      ]),
    ).toEqual(["docs/screenshot.png", "public/icons/logo.png"]);
  });
});
