// Start Vite, then run node tools/beam-capture.mjs <beam_proto directory> [--preview] [--haze].
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const target = process.argv[2];
if (!target) throw new Error("Provide the beam_proto directory");
const out = resolve(target);
const preview = process.argv.includes("--preview");
const withHaze = process.argv.includes("--haze");
const url = process.env.BEAM_LAB_URL ?? "http://127.0.0.1:5173/beam-lab.html";
const chromePath = process.env.BEAM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const fps = 30;
const seconds = 16;

async function waitFor(check, message) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await check().catch(() => null);
    if (result) return result;
    await delay(150);
  }
  throw new Error(message);
}

async function debuggerSession(profile) {
  const portFile = join(profile, "DevToolsActivePort");
  const port = await waitFor(async () => (await readFile(portFile, "utf8")).split("\n")[0], "Chrome debugger did not start");
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(list.find((page) => page.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  let nextId = 0;
  const calls = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") {
      console.error(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      console.error(message.params.args.map((arg) => arg.description ?? arg.value).join(" "));
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      console.error(message.params.entry.text, message.params.entry.url ?? "");
    }
    const callback = calls.get(message.id);
    if (!callback) return;
    calls.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const call of calls.values()) call.reject(new Error("Chrome debugger closed"));
  });
  const send = (method, params) => new Promise((resolveCall, reject) => {
    const id = ++nextId;
    calls.set(id, { resolve: resolveCall, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable", {});
  await send("Log.enable", {});
  await send("Emulation.setDeviceMetricsOverride", { width: 960, height: 480, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${url}?capture=1&t=8` });
  return {
    close: () => socket.close(),
    async evaluate(expression) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    },
  };
}

async function capture(session, time) {
  const data = await session.evaluate(`(() => {
    window.beamLab.setTime(${time});
    return document.querySelector("canvas").toDataURL("image/png").split(",")[1];
  })()`);
  return Buffer.from(data, "base64");
}

async function setState(session, state, haze) {
  await session.evaluate(`(() => {
    for (const [label, value] of [["Window state", "${state === "tell" ? "Tell" : "Empty"}"], ["Haze", "${haze ? "On" : "Off"}"]]) {
      const control = [...document.querySelectorAll("label")].find((item) => item.textContent.startsWith(label)).querySelector("select");
      control.value = value;
      control.dispatchEvent(new Event("change"));
    }
  })()`);
}

function encoder(args, pipe = false) {
  const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: [pipe ? "pipe" : "ignore", "inherit", "inherit"],
  });
  const done = once(child, "close").then(([code]) => {
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  });
  done.catch(() => {});
  return { child, done };
}

async function clip(session, state, haze = false) {
  const name = `clip_${state}${haze ? "_haze" : ""}.mp4`;
  await setState(session, state, haze);
  const { child, done } = encoder([
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "pipe:0",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "14",
    "-movflags", "+faststart", join(out, name),
  ], true);
  child.stdin.on("error", () => {});
  try {
    for (let frame = 0; frame < fps * seconds; frame += 1) {
      if (frame % 120 === 0) console.log(`${name} frame ${frame}/${fps * seconds}`);
      const data = await capture(session, frame / fps);
      await new Promise((resolveWrite, reject) => child.stdin.write(data, (error) => {
        if (error) reject(error);
        else resolveWrite();
      }));
    }
    child.stdin.end();
    await done;
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

const profile = await mkdtemp(join(tmpdir(), "window-beam-chrome-"));
const chrome = spawn(chromePath, [
  "--headless", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--enable-unsafe-swiftshader", "--disable-background-networking", "about:blank",
], { stdio: "ignore", windowsHide: true });
const chromeClosed = once(chrome, "close");
chromeClosed.catch(() => {});
let session;
try {
  session = await debuggerSession(profile);
  try {
    await waitFor(() => session.evaluate("Boolean(window.beamLab)"), "Lab failed to initialize");
  } catch (error) {
    const status = await session.evaluate('document.querySelector("#status")?.textContent');
    throw new Error(status || String(error));
  }
  const referenceTime = await session.evaluate("window.beamLab.referenceTime");
  const faceTimes = [-0.36, -0.18, 0, 0.18].map((offset) => referenceTime + offset);
  const reference = join(out, "shader_reference.png");
  await writeFile(reference, await capture(session, referenceTime));
  for (const [index, time] of faceTimes.entries()) {
    await writeFile(join(out, `cross_${index + 1}.png`), await capture(session, time));
  }
  await encoder(["-i", join(out, "groundtruth.png"), "-i", reference,
    "-filter_complex", "hstack", "-frames:v", "1", "-update", "1", join(out, "groundtruth_compare.png")]).done;
  if (preview) {
    await writeFile(join(out, "preview_dark.png"), await capture(session, 0));
    await setState(session, "tell", true);
    await writeFile(join(out, "preview_haze.png"), await capture(session, referenceTime));
  } else {
    await clip(session, "tell");
    await clip(session, "empty");
    if (withHaze) await clip(session, "tell", true);
  }
} finally {
  session?.close();
  if (chrome.exitCode === null) chrome.kill();
  await chromeClosed.catch(() => {});
  const resolvedProfile = await realpath(profile);
  if (dirname(resolvedProfile) !== await realpath(tmpdir())) throw new Error("Unexpected Chrome profile path");
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
