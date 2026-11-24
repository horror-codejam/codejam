import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../server/app";
import { cannedLine } from "../src/chud/lines";
import { liveSpeechParts, namedSpeechParts } from "../src/chud/speechParts";

const app = createApi({});

function speak(payload: unknown): Promise<Response> {
  return Promise.resolve(app.request("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("CHUD speech proxy", () => {
  it.each(["WARM", "HURT", "JEALOUS", "FURIOUS"])("forwards the final line and %s band without an LLM key", async (band) => {
    const wav = Uint8Array.of(82, 73, 70, 70);
    const piper = vi.fn(async () => new Response(wav, { headers: { "content-type": "audio/wav" } }));
    vi.stubGlobal("fetch", piper);
    const line = { text: "Safe with me, keeper.", band };

    const response = await speak(line);

    expect(piper).toHaveBeenCalledWith("http://127.0.0.1:5100/tts", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(line),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(wav);
  });

  it.each([
    { text: "  ", band: "WARM" },
    { text: "x".repeat(301), band: "WARM" },
    { text: "He's at the hatch.", band: "ANGRY" },
    { text: "Ram is in the lighthouse.", band: "WARM" },
  ])("rejects invalid or forbidden speech before calling Piper", async (line) => {
    const piper = vi.fn();
    vi.stubGlobal("fetch", piper);
    expect((await speak(line)).status).toBe(400);
    expect(piper).not.toHaveBeenCalled();
  });

  it("reports unavailable when Piper is offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection refused")));
    expect((await speak({ text: "I'm still here.", band: "WARM" })).status).toBe(503);
  });
});

describe("CHUD speech segments", () => {
  it("keeps short lines whole and splits a long reply at its first usable sentence", () => {
    expect(liveSpeechParts("I heard you. Come back to the desk.")).toBeUndefined();
    expect(liveSpeechParts("I saw your boat go under. I pulled you into the lighthouse before the waves could carry you away."))
      .toEqual(["I saw your boat go under.", "I pulled you into the lighthouse before the waves could carry you away."]);
  });

  it("splits at a clause and skips commas that belong to a list", () => {
    expect(liveSpeechParts("I heard knocking, scraping, and footsteps on the stairs, so keep the hatch locked until I tell you it's clear."))
      .toEqual(["I heard knocking, scraping, and footsteps on the stairs,", "so keep the hatch locked until I tell you it's clear."]);
  });

  it("records a complete name-free segment and keeps an ending name in its sentence", () => {
    expect(namedSpeechParts("Thanks for telling me, {n}. I'm glad you're here."))
      .toEqual(["Thanks for telling me, {n}.", "I'm glad you're here."]);
    expect(namedSpeechParts("Save your sweet words, {n}.")).toBeUndefined();
  });
});

it("uses the same short offline acknowledgement pool for new answers of any kind", () => {
  const replies = (value: string, factKey: string | null) => [0, 0.25, 0.5, 0.75].map((roll) => cannedLine(
    { kind: "answer_ack", pass: true, type: "SEED", value, factKey },
    { name: "Morgan", band: "WARM", rand: () => roll },
  ));
  const coffee = replies("Black, two sugars", null);
  expect(new Set(coffee).size).toBe(4);
  expect(replies("Halifax", "home_port")).toEqual(coffee);
});
