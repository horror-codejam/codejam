#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uDark;
uniform sampler2D uDarkEmpty;
uniform sampler2D uBeam;
uniform sampler2D uAngles;
uniform sampler2D uGrade;
uniform sampler2D uVignette;
uniform vec3 uRayOrigin;
uniform vec3 uRayAcross;
uniform vec3 uRayDown;
uniform float uLampHeight;
uniform float uAzimuth;
uniform float uTilt;
uniform float uWidth;
uniform float uHeight;
uniform float uSoftness;
uniform float uGain;
uniform float uDarkGain;
uniform float uHaze;

const float PI = 3.141592653589793;
const vec2 plateSize = vec2(960.0, 480.0);
const float shaper = 0.125;

vec3 decodeLight(vec3 srgb) {
    vec3 shaped = mix(srgb / 12.92, pow((srgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, srgb));
    return shaper * shaped / max(1.0 - shaped, 0.001);
}

vec2 anglesAt(ivec2 pixel) {
    vec3 bytes = floor(texelFetch(uAngles, pixel, 0).rgb * 255.0 + 0.5);
    float azimuth = (dot(bytes.rg, vec2(256.0, 1.0)) / 65535.0 - 0.5) * (2.0 * PI);
    float elevation = (bytes.b / 255.0 - 0.5) * PI;
    return vec2(azimuth, elevation);
}

float profile(vec2 angles) {
    float delta = mod(angles.x - uAzimuth + PI, 2.0 * PI) - PI;
    vec2 ellipse = 2.0 * vec2(delta / uWidth, (angles.y - uTilt) / uHeight);
    return 1.0 - smoothstep(1.0 - uSoftness, 1.0, length(ellipse));
}

vec3 combinePixel(ivec2 pixel) {
    pixel = clamp(pixel, ivec2(0), ivec2(plateSize) - 1);
    float edge = profile(anglesAt(pixel));
    vec3 ambient = decodeLight(texelFetch(uDarkEmpty, pixel, 0).rgb);
    if (edge <= 0.0) return ambient * uDarkGain;
    // Keep the room's ambient light, and fade in changes in the tell plate
    // locally with the beam so a hand or face cannot read through the dark.
    vec3 dark = mix(ambient, decodeLight(texelFetch(uDark, pixel, 0).rgb), edge * min(uGain, 1.0));
    vec3 beam = decodeLight(texelFetch(uBeam, pixel, 0).rgb);
    return dark * uDarkGain + beam * (uGain * edge);
}

vec3 combineAt(vec2 uv) {
    vec2 position = uv * plateSize - 0.5;
    ivec2 pixel = ivec2(floor(position));
    vec2 fraction = fract(position);
    // Warp the result of the lighting, so neither angle bytes nor geometry across an edge are mixed.
    vec3 top = mix(combinePixel(pixel), combinePixel(pixel + ivec2(1, 0)), fraction.x);
    vec3 bottom = mix(combinePixel(pixel + ivec2(0, 1)), combinePixel(pixel + ivec2(1, 1)), fraction.x);
    return mix(top, bottom, fraction.y);
}

vec2 lensUv(vec2 centered, float distortion) {
    return 0.5 + centered / (1.0 + sqrt(1.0 - distortion * dot(centered, centered)));
}

vec3 applyLens(vec2 uv) {
    // Blender radial lens, fitted at 0.008 distortion and 0.003 dispersion.
    // https://github.com/blender/blender/blob/main/source/blender/nodes/composite/nodes/node_composite_lens_distortion.cc
    // These settings span less than one pixel on either side of green at 960 x 480.
    vec2 centered = (uv * 2.0 - 1.0) / (1.0 + 2.0 * 0.00875);
    vec3 rg = combineAt(lensUv(centered, 0.0335));
    vec3 gb = combineAt(lensUv(centered, 0.0305));
    return vec3(rg.r, (rg.g + gb.g) * 0.5, gb.b);
}

vec3 hazeAt(vec2 uv) {
    vec2 sourceUv = lensUv((uv * 2.0 - 1.0) / 1.0175, 0.032);
    vec3 ray = normalize(uRayOrigin + sourceUv.x * uRayAcross + sourceUv.y * uRayDown);
    float elevation = anglesAt(ivec2(sourceUv * plateSize)).y;
    float depth = uLampHeight / max(0.01, ray.z - length(ray.xy) * tan(clamp(elevation, -1.56, 1.56)));
    float stepLength = min(depth, 6.0) / 16.0;
    float azimuth = atan(ray.y, ray.x);
    float scatter = 0.0;
    for (int index = 0; index < 16; ++index) {
        vec3 delta = ray * ((float(index) + 0.5) * stepLength) - vec3(0.0, 0.0, uLampHeight);
        float el = atan(delta.z, length(delta.xy));
        scatter += profile(vec2(azimuth, el)) / max(1.0, dot(delta, delta));
    }
    return vec3(0.008, 0.009, 0.011) * scatter * stepLength * uGain;
}

vec3 gradeSlice(vec2 rg, float blue) {
    vec2 tile = vec2(mod(blue, 8.0), floor(blue / 8.0));
    return texture(uGrade, (tile * 64.0 + rg + 0.5) / 512.0).rgb;
}

vec3 displayGrade(vec3 light) {
    vec3 point = clamp((light / (light + shaper)) / 0.992, 0.0, 1.0) * 63.0;
    float blue = floor(point.b);
    return mix(gradeSlice(point.rg, blue), gradeSlice(point.rg, min(blue + 1.0, 63.0)), fract(point.b));
}

void main() {
    vec3 light = applyLens(vUv);
    if (uHaze > 0.5) light += hazeAt(vUv);
    light *= texture(uVignette, vUv).r;
    fragColor = vec4(displayGrade(light), 1.0);
}
