import { handle } from "hono/vercel";
import { createApi } from "../server/app";

declare const process: { env: { ANTHROPIC_API_KEY?: string } };

const serve = handle(createApi({ apiKey: process.env.ANTHROPIC_API_KEY }));
const aliases = new Set(["health", "judge", "voice"]);

export default {
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/turn" && url.pathname !== "/api/turn") return serve(request);

    const route = url.searchParams.get("route");
    url.pathname = `/api/${route && aliases.has(route) ? route : "judge"}`;
    url.searchParams.delete("route");
    return serve(new Request(url, request));
  },
};
