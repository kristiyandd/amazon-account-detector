import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "./package.json" with { type: "json" };

type Manifest = Exclude<
  Awaited<Parameters<typeof defineManifest<string>>[0]>,
  (env: never) => unknown
>;

export const DEV_SERVER_PORT = 5173;

const MARKETPLACE_SUFFIXES = ["com", "co.uk", "de", "it", "fr"] as const;
const MARKETPLACE_ORIGINS = MARKETPLACE_SUFFIXES.map((suffix) => `https://www.amazon.${suffix}`);
const HOST_PATTERNS = MARKETPLACE_SUFFIXES.map((suffix) => `https://*.amazon.${suffix}/*`);
const ICONS = Object.fromEntries(
  [16, 32, 48, 128].map((size) => [String(size), `icons/icon-${String(size)}.png`]),
);
const DEV_SERVER_ORIGINS = [
  `http://localhost:${String(DEV_SERVER_PORT)}`,
  `ws://localhost:${String(DEV_SERVER_PORT)}`,
];

function contentSecurityPolicy(mode: string): string {
  const devOrigins = mode === "development" ? DEV_SERVER_ORIGINS : [];
  return [
    "default-src 'self'",
    ["script-src 'self'", ...devOrigins.slice(0, 1)].join(" "),
    ["connect-src 'self'", ...MARKETPLACE_ORIGINS, ...devOrigins].join(" "),
    ...(mode === "development" ? ["style-src 'self' 'unsafe-inline'"] : []),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function buildManifest(mode: string): Manifest {
  return {
    manifest_version: 3,
    name: "Amazon Account Detector",
    version: packageJson.version,
    description: packageJson.description,
    minimum_chrome_version: "120",
    action: {
      default_popup: "src/popup/index.html",
      default_title: "Amazon Account Detector",
      default_icon: ICONS,
    },
    icons: ICONS,
    background: {
      service_worker: "src/background/index.ts",
      type: "module",
    },
    permissions: ["storage", "cookies"],
    host_permissions: HOST_PATTERNS,
    externally_connectable: { ids: [] },
    incognito: "not_allowed",
    content_security_policy: { extension_pages: contentSecurityPolicy(mode) },
  };
}

export const manifest = defineManifest((env) => buildManifest(env.mode));
