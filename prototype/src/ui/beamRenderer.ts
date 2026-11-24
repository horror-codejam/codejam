// PixiJS Filter renderer for the rotating ceiling beam (linear light + bounce + haze + AgX LUT grade).
// Renders a full 1600 x 800 plate into a dedicated RenderTexture so camera pan/zoom/roll never distort filter UVs.

import { Container, Filter, GlProgram, RenderTexture, Sprite, Texture, UniformGroup, type Renderer } from "pixi.js";
import { CONFIG } from "../config";
import { defaultBeamParams, type BeamParams } from "../sim/beam";
import { beamManifest, type BeamGradeTextures, type BeamSlotTextures } from "./art";
import fragment from "./beam.frag?raw";

const DEG_TO_RAD = Math.PI / 180;
const BEAM_W = 1600;
const BEAM_H = 800;

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

export class BeamRenderer {
  readonly rt: RenderTexture;
  readonly params: BeamParams = defaultBeamParams(CONFIG);

  private readonly stage = new Container();
  private readonly quad: Sprite;
  private readonly filter: Filter;
  private readonly uniforms: UniformGroup;
  private readonly plateSize = new Float32Array([BEAM_W, BEAM_H]);
  private readonly rayOrigin = new Float32Array([0, 0, 0]);
  private readonly rayAcross = new Float32Array([1, 0, 0]);
  private readonly rayDown = new Float32Array([0, 0, -1]);
  private readonly cameraOffset = new Float32Array([0, 0, -2.6]);

  constructor(grade: BeamGradeTextures) {
    this.rt = RenderTexture.create({ width: BEAM_W, height: BEAM_H, resolution: 1 });
    const hazeColor = beamManifest.haze.linearColor;
    const hazeRange = beamManifest.haze.rangeMeters;
    this.uniforms = new UniformGroup({
      uPlateSize: { value: this.plateSize, type: "vec2<f32>" },
      uRayOrigin: { value: this.rayOrigin, type: "vec3<f32>" },
      uRayAcross: { value: this.rayAcross, type: "vec3<f32>" },
      uRayDown: { value: this.rayDown, type: "vec3<f32>" },
      uCameraOffset: { value: this.cameraOffset, type: "vec3<f32>" },
      uHazeColor: { value: new Float32Array([hazeColor[0], hazeColor[1], hazeColor[2]]), type: "vec3<f32>" },
      uHazeRange: { value: hazeRange, type: "f32" },
      uAzimuth: { value: this.params.startAngle, type: "f32" },
      uTilt: { value: this.params.tilt, type: "f32" },
      uWidth: { value: this.params.width, type: "f32" },
      uHeight: { value: this.params.height, type: "f32" },
      uSoftness: { value: this.params.softness, type: "f32" },
      uGain: { value: this.params.gain, type: "f32" },
      uDarkGain: { value: this.params.darkGain, type: "f32" },
      uHaze: { value: this.params.haze, type: "f32" },
      uHasBounce: { value: 0, type: "f32" },
      uBounceAzimuth: { value: 0, type: "f32" },
      uBounceGain: { value: 0, type: "f32" },
    });
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex, fragment, name: "watch-room-beam" }),
      resources: {
        beamUniforms: this.uniforms,
        uDark: Texture.WHITE.source,
        uDarkEmpty: Texture.WHITE.source,
        uBeam: Texture.WHITE.source,
        uBounce: Texture.WHITE.source,
        uAngles: Texture.WHITE.source,
        uHazeDepth: Texture.WHITE.source,
        uGrade: grade.grade.source,
        uVignette: grade.vignette.source,
      },
    });
    this.quad = new Sprite(Texture.WHITE);
    this.quad.width = BEAM_W;
    this.quad.height = BEAM_H;
    this.quad.filters = [this.filter];
    this.stage.addChild(this.quad);
  }

  get texture(): RenderTexture {
    return this.rt;
  }

  render(
    renderer: Renderer,
    slot: BeamSlotTextures,
    azimuth: number,
    lampOn: boolean,
    darkScale = 1,
  ): RenderTexture {
    const meta = slot.meta;
    const lampPos = beamManifest.lamp.position;
    const u = this.uniforms.uniforms;
    this.plateSize[0] = meta.width;
    this.plateSize[1] = meta.height;
    this.rayOrigin[0] = meta.rayOrigin[0];
    this.rayOrigin[1] = meta.rayOrigin[1];
    this.rayOrigin[2] = meta.rayOrigin[2];
    this.rayAcross[0] = meta.rayAcross[0];
    this.rayAcross[1] = meta.rayAcross[1];
    this.rayAcross[2] = meta.rayAcross[2];
    this.rayDown[0] = meta.rayDown[0];
    this.rayDown[1] = meta.rayDown[1];
    this.rayDown[2] = meta.rayDown[2];
    this.cameraOffset[0] = meta.position[0] - lampPos[0];
    this.cameraOffset[1] = meta.position[1] - lampPos[1];
    this.cameraOffset[2] = meta.position[2] - lampPos[2];
    u.uAzimuth = azimuth;
    u.uTilt = this.params.tilt;
    u.uWidth = this.params.width;
    u.uHeight = this.params.height;
    u.uSoftness = this.params.softness;
    u.uGain = lampOn ? this.params.gain : 0;
    u.uDarkGain = this.params.darkGain * darkScale;
    u.uHaze = this.params.haze;
    if (slot.bounce && meta.bounce) {
      u.uHasBounce = 1;
      u.uBounceAzimuth = meta.bounce.azimuth * DEG_TO_RAD;
      u.uBounceGain = meta.bounce.gain;
    } else {
      u.uHasBounce = 0;
      u.uBounceAzimuth = 0;
      u.uBounceGain = 0;
    }
    this.filter.resources.uDark = slot.dark.source;
    this.filter.resources.uDarkEmpty = slot.darkEmpty.source;
    this.filter.resources.uBeam = slot.beam.source;
    this.filter.resources.uBounce = (slot.bounce ?? slot.darkEmpty).source;
    this.filter.resources.uAngles = slot.angles.source;
    this.filter.resources.uHazeDepth = slot.hazeDepth.source;
    renderer.render({ container: this.stage, target: this.rt, clear: true });
    return this.rt;
  }
}
