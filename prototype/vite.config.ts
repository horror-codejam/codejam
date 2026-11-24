import { getRequestListener } from "@hono/node-server";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
    plugins: [
      chudApi(env.ANTHROPIC_API_KEY || undefined),
      {
        name: "exclude-window-lab",
        apply: "build",
        async writeBundle({ dir }) {
          if (!dir) return;
          const output = resolve(dir);
          const lab = resolve(output, "beam-lab");
          // Vite copies public assets before writing the application bundle.
          if (dirname(lab) === output && lab !== resolve(root, "public", "beam-lab")) {
            await rm(lab, { force: true, recursive: true });
          }
        },
      },
      // Final stills and clips live outside the Vite root. Include new conversions in the art globs.
      {
        name: "watch-final-renders",
        configureServer(server) {
          server.watcher.add(fileURLToPath(new URL("../scenes/03-watch-room/final", import.meta.url)));
          server.watcher.add(fileURLToPath(new URL("../scenes/03-watch-room/final_beam", import.meta.url)));
        },
      },
    ],
    // The game reads the team's renders straight from ../scenes, outside the Vite root.
    server: { port: 5173, fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
    test: {
      globals: true,
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
