import { getRequestListener } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { createApi } from "./server/app";

const root = fileURLToPath(new URL(".", import.meta.url));

// Mounts the Hono API (server/app.ts) on /api inside the Vite dev server, so `npm run dev` is one command.
// ANTHROPIC_API_KEY comes from prototype/.env and stays on the server side.
function chudApi(apiKey: string | undefined): Plugin {
  return {
    name: "chud-api",
    configureServer(server) {
      const listener = getRequestListener(createApi({ apiKey }).fetch);
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api/")) return void listener(req, res);
        next();
      });
      server.config.logger.info(apiKey ? "  CHUD API: LLM on (Claude Haiku 5.5)" : "  CHUD API: no ANTHROPIC_API_KEY in prototype/.env, offline judge only");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  return {
    plugins: [chudApi(env.ANTHROPIC_API_KEY || undefined)],
    server: { port: 5173 },
    test: {
      globals: true,
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
