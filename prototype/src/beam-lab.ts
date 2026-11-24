import { Application, Filter, GlProgram, ImageSource, Sprite, Texture, UniformGroup } from "pixi.js";
import fragment from "./beam-lab.frag?raw";

const width = 960;
const height = 480;
const base = "/beam-lab/";
const phase = 12;
const radians = Math.PI / 180;
const capture = new URLSearchParams(location.search);

type State = "empty" | "tell";
type Axis = [number, number, number];
type Settings = {
  tilt: number; width: number; height: number; softness: number; darkness: number; referenceAzimuth: number;
  rayOrigin: Axis; rayAcross: Axis; rayDown: Axis; lampHeight: number;
};

const vertex = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    vec2 scale = vec2(2.0, 2.0 * uOutputTexture.z) / uOutputTexture.xy;
    gl_Position = vec4(position * scale - vec2(1.0, uOutputTexture.z), 0.0, 1.0);
    vUv = aPosition;
}`;

async function asset(name: string, linear = false): Promise<Texture> {
  const response = await fetch(base + name);
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  return new Texture({ source: new ImageSource({ resource: bitmap, scaleMode: linear ? "linear" : "nearest" }) });
}

async function plates(state: State) {
  const [dark, beam, angles] = await Promise.all([
    asset(`${state}_dark.webp`), asset(`${state}_beam.webp`), asset(`${state}_angles.png`),
  ]);
  return { dark, beam, angles };
}

async function start() {
  const [empty, tell, grade, vignette, response] = await Promise.all([
    plates("empty"), plates("tell"), asset("grade.png", true), asset("vignette.png", true), fetch(`${base}settings.json`),
  ]);
  if (!response.ok) throw new Error(`Could not load render settings (${response.status})`);
  const settings = await response.json() as Settings;
  const states = { empty, tell };
  const demo = new Application();
  await demo.init({ width, height, resolution: 1, preference: "webgl", preferWebGLVersion: 2,
    antialias: false, autoStart: false, preserveDrawingBuffer: capture.has("t"), background: 0x030506 });
  const view = document.querySelector<HTMLDivElement>("#view")!;
  demo.canvas.setAttribute("aria-label", "Rotating light on the watch-room window");
  view.append(demo.canvas);

  const uniforms = new UniformGroup({
    uAzimuth: { value: 0, type: "f32" },
    uTilt: { value: settings.tilt * radians, type: "f32" },
    uWidth: { value: settings.width * radians, type: "f32" },
    uHeight: { value: settings.height * radians, type: "f32" },
    uSoftness: { value: settings.softness, type: "f32" },
    uGain: { value: 1, type: "f32" },
    uDarkGain: { value: settings.darkness, type: "f32" },
    uHaze: { value: Number(capture.get("haze") === "1"), type: "f32" },
    uRayOrigin: { value: settings.rayOrigin, type: "vec3<f32>" },
    uRayAcross: { value: settings.rayAcross, type: "vec3<f32>" },
    uRayDown: { value: settings.rayDown, type: "vec3<f32>" },
    uLampHeight: { value: settings.lampHeight, type: "f32" },
  });
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: "window-light" }),
    resources: { lightUniforms: uniforms, uDark: tell.dark.source, uBeam: tell.beam.source,
      uAngles: tell.angles.source, uDarkEmpty: empty.dark.source, uGrade: grade.source, uVignette: vignette.source },
  });
  const image = new Sprite(Texture.WHITE);
  image.width = width;
  image.height = height;
  image.filters = [filter];
  demo.stage.addChild(image);

  let period = 16;
  let fixedTime = capture.has("t") && Number.isFinite(Number(capture.get("t"))) ? Number(capture.get("t")) : undefined;
  let clock = 0;
  let previous = performance.now();
  const draw = (time: number) => {
    uniforms.uniforms.uAzimuth = (phase + 360 * (time % period) / period) * radians;
    demo.render();
  };
  const setState = (state: State) => {
    const { dark, beam, angles } = states[state];
    filter.resources.uDark = dark.source;
    filter.resources.uBeam = beam.source;
    filter.resources.uAngles = angles.source;
  };
  const initialState = capture.get("state") === "empty" ? "empty" : "tell";
  setState(initialState);
  const controls = document.querySelector<HTMLDivElement>("#controls")!;
  function range(label: string, value: number, min: number, max: number, step: number, unit: string, set: (value: number) => void) {
    const row = document.createElement("label");
    const caption = document.createElement("span");
    const readout = document.createElement("output");
    const input = document.createElement("input");
    caption.textContent = label;
    readout.className = "value";
    caption.append(readout);
    input.type = "range";
    Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(value) });
    const update = () => {
      readout.value = `${input.value}${unit}`;
      set(input.valueAsNumber);
      draw(fixedTime ?? clock);
    };
    input.addEventListener("input", update);
    readout.value = `${input.value}${unit}`;
    row.append(caption, input);
    controls.append(row);
  }
  function select(label: string, values: string[], initial: string, set: (value: string) => void) {
    const row = document.createElement("label");
    row.append(label);
    const input = document.createElement("select");
    for (const value of values) input.append(new Option(value, value));
    input.value = initial;
    input.addEventListener("change", () => { set(input.value); draw(fixedTime ?? clock); });
    row.append(input);
    controls.append(row);
  }
  const values = uniforms.uniforms;
  range("Rotation", period, 4, 40, 0.5, " s", (value) => {
    clock *= value / period;
    period = value;
  });
  range("Width", settings.width, 3, 70, 1, "°", (value) => { values.uWidth = value * radians; });
  range("Height", settings.height, 8, 110, 1, "°", (value) => { values.uHeight = value * radians; });
  range("Tilt", settings.tilt, -75, 20, 1, "°", (value) => { values.uTilt = value * radians; });
  range("Softness", settings.softness * 100, 5, 100, 1, "%", (value) => { values.uSoftness = value / 100; });
  range("Gain", 1, 0, 3, 0.05, "×", (value) => { values.uGain = value; });
  range("Darkness", (1 - settings.darkness) * 100, 0, 100, 1, "%", (value) => { values.uDarkGain = 1 - value / 100; });
  select("Haze", ["Off", "On"], values.uHaze ? "On" : "Off", (value) => { values.uHaze = Number(value === "On"); });
  select("Window state", ["Empty", "Tell"], initialState === "empty" ? "Empty" : "Tell", (value) => {
    setState(value === "Empty" ? "empty" : "tell");
  });
  controls.hidden = false;
  document.querySelector("#status")!.textContent = "";
  draw(fixedTime ?? clock);
  if (fixedTime === undefined) {
    demo.ticker.add(() => {
      const now = performance.now();
      clock = (clock + (now - previous) / 1000) % period;
      previous = now;
      draw(fixedTime ?? clock);
    });
    demo.ticker.start();
  }

  return {
    setTime(seconds: number) {
      if (!Number.isFinite(seconds)) throw new Error("Capture time must be finite");
      fixedTime = seconds;
      demo.ticker.stop();
      draw(seconds);
    },
    canvas: demo.canvas,
    referenceTime: ((settings.referenceAzimuth - phase + 360) % 360) / 360 * period,
  };
}

declare global {
  interface Window { beamLab?: Awaited<ReturnType<typeof start>>; }
}

if (import.meta.env.DEV) {
  start().then((lab) => { window.beamLab = lab; }).catch((error: unknown) => {
    document.querySelector("#status")!.textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
  });
}
