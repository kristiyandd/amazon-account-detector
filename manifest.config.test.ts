import { describe, expect, it } from "vitest";
import { buildManifest } from "./manifest.config.ts";

const MARKETPLACE_HOSTS = [
  "https://*.amazon.com/*",
  "https://*.amazon.co.uk/*",
  "https://*.amazon.de/*",
  "https://*.amazon.it/*",
  "https://*.amazon.fr/*",
];

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; connect-src 'self' https://www.amazon.com https://www.amazon.co.uk https://www.amazon.de https://www.amazon.it https://www.amazon.fr; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

describe("manifest", () => {
  it("requests only storage and cookies, with wildcard Amazon hosts so the session cookie is visible", () => {
    expect(buildManifest("production")).toMatchObject({
      manifest_version: 3,
      permissions: ["storage", "cookies"],
      host_permissions: MARKETPLACE_HOSTS,
    });
  });

  it("stays closed to other extensions and to incognito so sessions never mix", () => {
    const manifest = buildManifest("production");
    expect(manifest).toMatchObject({
      externally_connectable: { ids: [] },
      incognito: "not_allowed",
    });
    expect(manifest).not.toHaveProperty("web_accessible_resources");
  });

  it("ships the generated toolbar and store icons at every size Chrome asks for", () => {
    const icons = {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    };
    const manifest = buildManifest("production");
    expect(manifest.icons).toEqual(icons);
    expect(manifest.action).toEqual({
      default_popup: "src/popup/index.html",
      default_title: "Amazon Account Detector",
      default_icon: icons,
    });
  });

  it("allows network access only to the five marketplaces in a production build", () => {
    expect(buildManifest("production").content_security_policy?.extension_pages).toBe(
      PRODUCTION_CSP,
    );
  });

  it("lets the dev build load scripts from the local Vite server, which production never allows", () => {
    const csp = buildManifest("development").content_security_policy?.extension_pages;
    expect(csp).toContain("script-src 'self' http://localhost:5173;");
    expect(csp).toContain("ws://localhost:5173");
    expect(buildManifest("production").content_security_policy?.extension_pages).not.toContain(
      "localhost",
    );
  });
});
