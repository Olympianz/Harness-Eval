import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(async ({ mode }) => {
  const id = process.env.HARNESS_HYPERDRIVE_ID?.trim();
  if (id && !/^[0-9a-f]{32}$/i.test(id)) throw Error("Invalid HARNESS_HYPERDRIVE_ID");
  if (mode === "nas-production" && !id) throw Error("Set HARNESS_HYPERDRIVE_ID before deploying");
  if (id) process.env.NEXT_PUBLIC_STORAGE_MODE = "nas";
  // Local tooling state; no hosting control plane required.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    resolve: { alias: { "#workspace-db": fileURLToPath(new URL("./lib/workspace-db.worker.ts", import.meta.url)) } },
    server: {
      host: "127.0.0.1", port: 5173,
      ...(process.env.CODEX_SANDBOX === "seatbelt"
        ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        ...(id ? { config: { hyperdrive: [{ binding: "HYPERDRIVE", id }] } } : {}),
        configPath: "./wrangler.jsonc",
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
      }),
    ],
  };
});
