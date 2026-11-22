import { getRequestListener } from "@hono/node-server";
import { createApi } from "../server/app.js";

declare const process: { env: { ANTHROPIC_API_KEY?: string } };

const app = createApi({ apiKey: process.env.ANTHROPIC_API_KEY });
const aliases = new Set(["health", "judge", "voice"]);
const turnPaths = new Set(["/turn", "/api/turn", "/api/turn.ts", "/prototype/api/turn.ts"]);

export default getRequestListener((request) => {
  const url = new URL(request.url);
  if (!turnPaths.has(url.pathname)) return app.fetch(request);

  const route = url.searchParams.get("route");
  url.pathname = `/api/${route && aliases.has(route) ? route : "judge"}`;
  url.searchParams.delete("route");
  return app.fetch(new Request(url, request));
});
