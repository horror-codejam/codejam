// The game's API. Runs inside the Vite dev server for now (see vite.config.ts); the same Hono app
// can be deployed as a Vercel function later. The API key never reaches the browser.

import { Hono } from "hono";
import type { Band, JudgeInput } from "../src/sim/types";
import { judgeWithClaude, makeClient, voiceWithClaude } from "./llm";
import { VOICED_KINDS, type VoiceRequest } from "./prompts";

const BANDS: Band[] = ["WARM", "HURT", "JEALOUS", "FURIOUS"];
const RATE_PER_MIN = 90;

export function createApi(opts: { apiKey?: string }): Hono {
  const app = new Hono().basePath("/api");
  const client = opts.apiKey ? makeClient(opts.apiKey) : null;
  const hits = new Map<string, number[]>();

  app.use("*", async (c, next) => {
    if (c.req.method !== "POST") return next();
    const ip = c.req.header("x-forwarded-for") ?? "local";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= RATE_PER_MIN) return c.json({ error: "rate limited" }, 429);
    recent.push(now);
    hits.set(ip, recent);
    return next();
  });

  app.get("/health", (c) => c.json({ llm: !!client }));

  app.post("/judge", async (c) => {
    if (!client) return c.json({ error: "no api key" }, 503);
    const body = (await c.req.json().catch(() => null)) as { input?: JudgeInput } | null;
    const input = body?.input;
    if (!input || typeof input.text !== "string" || input.text.length > 200 || typeof input.facts !== "object" || !BANDS.includes(input.band)) {
      return c.json({ error: "bad request" }, 400);
    }
    const t0 = Date.now();
    try {
      const result = await judgeWithClaude(client, input);
      console.log(`[api] judge ${Date.now() - t0} ms`, JSON.stringify(input.text), flagsOf(result));
      return c.json({ result });
    } catch (err) {
      console.warn(`[api] judge failed after ${Date.now() - t0} ms:`, (err as Error).message);
      return c.json({ error: "judge failed" }, 502);
    }
  });

  app.post("/voice", async (c) => {
    if (!client) return c.json({ error: "no api key" }, 503);
    const r = (await c.req.json().catch(() => null)) as VoiceRequest | null;
    if (!r || !VOICED_KINDS.includes(r.kind) || typeof r.canned !== "string" || !BANDS.includes(r.band) || !Array.isArray(r.recent)) {
      return c.json({ error: "bad request" }, 400);
    }
    const req: VoiceRequest = {
      kind: r.kind,
      pass: !!r.pass,
      qtype: typeof r.qtype === "string" ? r.qtype : undefined,
      canned: r.canned.slice(0, 300),
      band: r.band,
      name: String(r.name ?? "").slice(0, 40),
      night: Math.max(1, Math.min(5, Number(r.night) || 1)),
      recent: r.recent.slice(-6).map((l) => String(l).slice(0, 240)),
    };
    const t0 = Date.now();
    try {
      const text = await voiceWithClaude(client, req);
      console.log(`[api] voice ${Date.now() - t0} ms ${req.kind}/${req.band}:`, text);
      return c.json({ text });
    } catch (err) {
      console.warn(`[api] voice failed after ${Date.now() - t0} ms:`, (err as Error).message);
      return c.json({ error: "voice failed" }, 502);
    }
  });

  return app;
}

function flagsOf(r: object): string {
  return Object.entries(r)
    .filter(([, v]) => v === true || (typeof v === "string" && v !== "NONE") || (v && typeof v === "object"))
    .map(([k, v]) => (v === true ? k : `${k}=${JSON.stringify(v)}`))
    .join(" ");
}
