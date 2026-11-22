import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../server/app";

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
