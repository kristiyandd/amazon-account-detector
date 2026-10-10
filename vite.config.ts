import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { DEV_SERVER_PORT, manifest } from "./manifest.config.ts";

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: DEV_SERVER_PORT,
    strictPort: true,
    hmr: { host: "localhost", port: DEV_SERVER_PORT },
  },
  build: {
    target: "chrome120",
    modulePreload: { polyfill: false },
  },
});
