#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uDark;
uniform sampler2D uDarkEmpty;
uniform sampler2D uBeam;
uniform sampler2D uBounce;
uniform sampler2D uAngles;
uniform sampler2D uHazeDepth;
uniform sampler2D uGrade;
uniform sampler2D uVignette;

uniform vec2 uPlateSize;
uniform vec2 uAmbientHighlights;
uniform vec3 uRayOrigin;
uniform vec3 uRayAcross;
uniform vec3 uRayDown;
uniform vec3 uCameraOffset;
uniform vec3 uHazeColor;
uniform float uHazeRange;
uniform float uAzimuth;
uniform float uTilt;
uniform float uWidth;
uniform float uHeight;
uniform float uSoftness;
uniform float uGain;
uniform float uDarkGain;
uniform float uHaze;
uniform float uHasBounce;
uniform float uBounceAzimuth;
uniform float uBounceGain;

const float PI = 3.141592653589793;
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

vec3 shadowAmbient(vec3 ambient) {
    // The dark render still catches exterior reflections. Roll those highlights off
    // in linear light so wet glass and trim do not compete with the ceiling beam.
    float peak = max(ambient.r, max(ambient.g, ambient.b));
    float excess = max(peak - uAmbientHighlights.x, 0.0);
    float reduction = excess * excess / (excess + uAmbientHighlights.y);
    return ambient * (1.0 - reduction / max(peak, 0.000001));
}

vec3 combinePixel(ivec2 pixel, float bounceEdge) {
    pixel = clamp(pixel, ivec2(0), ivec2(uPlateSize) - 1);
    vec3 ambient = shadowAmbient(decodeLight(texelFetch(uDarkEmpty, pixel, 0).rgb));
    if (uGain <= 0.0001) return ambient * uDarkGain;
    float edge = profile(anglesAt(pixel));
    if (edge <= 0.0 && bounceEdge <= 0.0) return ambient * uDarkGain;
    // Restore the authored ambient and any tell/approach/inside change where the beam lands.
    float reveal = max(edge, bounceEdge) * min(uGain, 1.0);
    vec3 dark = mix(ambient, decodeLight(texelFetch(uDark, pixel, 0).rgb), reveal);
    vec3 light = dark * uDarkGain;
    if (edge > 0.0) light += decodeLight(texelFetch(uBeam, pixel, 0).rgb) * (uGain * edge);
    if (bounceEdge > 0.0) light += decodeLight(texelFetch(uBounce, pixel, 0).rgb) * (uGain * bounceEdge * uBounceGain);
    return light;
}

vec3 combineAt(vec2 uv, float bounceEdge) {
    vec2 position = uv * uPlateSize - 0.5;
    ivec2 pixel = ivec2(floor(position));
    vec2 fraction = fract(position);
    // Warp the result of the lighting, so neither angle bytes nor geometry across an edge are mixed.
    vec3 top = mix(combinePixel(pixel, bounceEdge), combinePixel(pixel + ivec2(1, 0), bounceEdge), fraction.x);
    vec3 bottom = mix(combinePixel(pixel + ivec2(0, 1), bounceEdge), combinePixel(pixel + ivec2(1, 1), bounceEdge), fraction.x);
    return mix(top, bottom, fraction.y);
}

vec2 lensUv(vec2 centered, float distortion) {
    return 0.5 + centered / (1.0 + sqrt(1.0 - distortion * dot(centered, centered)));
}

vec3 applyLens(vec2 uv, float bounceEdge) {
    // Blender radial lens, fitted at 0.008 distortion and 0.003 dispersion.
    vec2 centered = (uv * 2.0 - 1.0) / (1.0 + 2.0 * 0.00875);
    vec3 rg = combineAt(lensUv(centered, 0.0335), bounceEdge);
    vec3 gb = combineAt(lensUv(centered, 0.0305), bounceEdge);
    return vec3(rg.r, (rg.g + gb.g) * 0.5, gb.b);
}

vec3 hazeAt(vec2 uv) {
    if (uHaze <= 0.001 || uGain <= 0.001) return vec3(0.0);
    vec2 sourceUv = lensUv((uv * 2.0 - 1.0) / 1.0175, 0.032);
    vec3 ray = normalize(uRayOrigin + sourceUv.x * uRayAcross + sourceUv.y * uRayDown);
    ivec2 pixel = clamp(ivec2(sourceUv * uPlateSize), ivec2(0), ivec2(uPlateSize) - 1);
    float depth = texelFetch(uHazeDepth, pixel, 0).r * uHazeRange;
    float stepLength = depth / 16.0;
    float scatter = 0.0;
    for (int index = 0; index < 16; ++index) {
        vec3 delta = ray * ((float(index) + 0.5) * stepLength) + uCameraOffset;
        float planar = length(delta.xy);
        float azimuth = atan(delta.y, delta.x);
        float elevation = atan(delta.z, planar);
        scatter += profile(vec2(azimuth, elevation)) / max(1.0, dot(delta, delta));
    }
    return uHazeColor * (scatter * stepLength * uGain * uHaze);
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
    float bounceEdge = uHasBounce > 0.5 && uGain > 0.0001 ? profile(vec2(uBounceAzimuth, uTilt)) : 0.0;
    vec3 light = applyLens(vUv, bounceEdge);
    light += hazeAt(vUv);
    light *= texture(uVignette, vUv).r;
    vec3 display = displayGrade(light);
    // Break up shadow bands at the 8-bit render target. Keep the offset stationary,
    // achromatic and below half a code value, with no offset in brighter pixels.
    uint pixel = uint(gl_FragCoord.x) + uint(gl_FragCoord.y) * uint(uPlateSize.x);
    uint hash = pixel * 747796405u + 2891336453u;
    hash = ((hash >> ((hash >> 28u) + 4u)) ^ hash) * 277803737u;
    float noise = (float(((hash >> 22u) ^ hash) & 255u) + 0.5) / 256.0 - 0.5;
    float shadow = 1.0 - smoothstep(0.02, 0.10, max(display.r, max(display.g, display.b)));
    fragColor = vec4(display + vec3(noise * shadow / 255.0), 1.0);
}
