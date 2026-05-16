import * as twgl from "twgl.js";
import type { MaskFrame } from "@/lib/segmentation/cpuComposite";

type GL = WebGL2RenderingContext;

type RenderTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

export type WaterSettings = {
  waterFill: number;
  maskThreshold: number;
  maskFeather: number;
  renderScale: number;
  simSize: number;
  waveSpeed: number;
  damping: number;
  restoringForce: number;
  motionImpulse: number;
  // Edge-impulse knobs: simulation path is commented out in SIMULATION_SHADER (body impulse only).
  // Kept on the type/defaults so flatten-from-demo-params stays stable when physics sliders return.
  edgeImpulse: number;
  /** Spatial scale of the pseudo-random ripple pattern modulating edge impulse. */
  edgeRippleSpatialScale: number;
  /** Time scale for how fast that edge ripple pattern moves. */
  edgeRippleTimeScale: number;
  /** Gain on silhouette mask gradient driving edge ripples (was fixed ×2.5). */
  maskEdgeGain: number;
  surfaceSplash: number;
  surfaceWidth: number;
  surfaceNoiseAmplitude: number;
  surfaceNoiseFrequency: number;
  surfaceChopAmplitude: number;
  surfaceChopFrequency: number;
  waterBrightness: number;
  waterAlpha: number;
  /** Body tint (linear 0–1 channels; Tweakpane color). */
  waterColor: { r: number; g: number; b: number };
  /** Broad Fresnel-style tint from wave slope (amount). */
  waterGlint: number;
  /** Tint multiplied by glint (linear 0–1). */
  waterGlintColor: { r: number; g: number; b: number };
  /** smoothstep low edge on gradient magnitude for glint. */
  waterGlintNormalMin: number;
  /** smoothstep high edge on gradient magnitude for glint. */
  waterGlintNormalMax: number;
  /** Sharp sun/sky highlight lobe strength (separate from glint). */
  waterSpecular: number;
  /** Specular highlight tint (linear 0–1). */
  waterSpecularColor: { r: number; g: number; b: number };
  /** Primary specular exponent (Blinn-Phong-style shininess). */
  waterSpecularShininess: number;
  /** Weight of the broader sheen lobe added to the sharp specular. */
  waterSpecularSheenWeight: number;
  /** Exponent for the broader sheen lobe. */
  waterSpecularSheenPower: number;
  /** Specular strength when glint=0 (base coupling). */
  waterSpecularCouplingFlat: number;
  /** Extra specular scale multiplied by glint (0–1). */
  waterSpecularCouplingGlint: number;
  /** Light direction X (normalized in shader). */
  waterSpecularLightX: number;
  waterSpecularLightY: number;
  waterSpecularLightZ: number;
  /** Scales XY of simulation gradient when building shading normal (micro-relief). */
  waterSpecularNormalScale: number;
  /** Bright foam / splash streak along the waterline. */
  waterFoam: number;
  /** Foam color near the waterline (linear 0–1). */
  waterFoamColorA: { r: number; g: number; b: number };
  /** Foam / splash secondary tint (linear 0–1). */
  waterFoamColorB: { r: number; g: number; b: number };
  /** 0 = grayscale water, 1 = default, >1 exaggerates chroma. */
  waterSaturation: number;
  /** Width of the air–water blend along the silhouette. */
  waterSurfaceBlend: number;
  /** UV displacement strength for underwater camera refraction (wave normal). */
  waterRefraction: number;
  /**
   * Time constant (ms) for the displayed mask to ease toward each new segmentation.
   * 0 = no temporal smoothing (mask snaps every segmentation tick).
   */
  maskTemporalHalfLifeMs: number;
  /**
   * Integer pixel radius for separable box blur before hard thresholding the mask.
   * 0 = use raw model probabilities (no blur+threshold pass).
   */
  maskBlurRadius: number;
};

export const DEFAULT_WATER_SETTINGS: WaterSettings = {
  waterFill: 0.5,
  maskThreshold: 0.47,
  maskFeather: 0.101,
  renderScale: 1,
  simSize: 576,
  waveSpeed: 0.28,
  damping: 0.98,
  restoringForce: 0.04,
  motionImpulse: 2,
  // Defaults for edge-impulse uniforms (unused while SIMULATION_SHADER edge path is off).
  edgeImpulse: 1.01,
  edgeRippleSpatialScale: 1,
  edgeRippleTimeScale: 1,
  maskEdgeGain: 2.5,
  surfaceSplash: 0,
  surfaceWidth: 0.041,
  surfaceNoiseAmplitude: 0.009,
  surfaceNoiseFrequency: 0.85,
  surfaceChopAmplitude: 0.005,
  surfaceChopFrequency: 0.1,
  waterBrightness: 2,
  waterAlpha: 0.67,
  waterColor: { r: 0.02, g: 0.18, b: 0.8 },
  waterGlint: 2.5,
  waterGlintColor: { r: 0.02, g: 0.07, b: 0.18 },
  waterGlintNormalMin: 0.08,
  waterGlintNormalMax: 0.28,
  waterSpecular: 2.5,
  waterSpecularColor: { r: 0.92, g: 0.96, b: 1.0 },
  waterSpecularShininess: 88,
  waterSpecularSheenWeight: 0.2,
  waterSpecularSheenPower: 14,
  waterSpecularCouplingFlat: 0.65,
  waterSpecularCouplingGlint: 0.35,
  waterSpecularLightX: 0.34,
  waterSpecularLightY: 0.4,
  waterSpecularLightZ: 0.85,
  waterSpecularNormalScale: 3.2,
  waterFoam: 2.5,
  waterFoamColorA: { r: 0.05, g: 0.12, b: 0.24 },
  waterFoamColorB: { r: 0.08, g: 0.18, b: 0.32 },
  waterSaturation: 1.24,
  waterSurfaceBlend: 0.002,
  waterRefraction: 0.028,
  /** 0 = mask snaps to each segmentation (stronger body motion impulse). */
  maskTemporalHalfLifeMs: 0,
  maskBlurRadius: 10,
};

/** Clone for React state / immutable snapshots (nested `waterColor` is copied). */
export function cloneWaterSettings(settings: WaterSettings): WaterSettings {
  return {
    ...settings,
    waterColor: { ...settings.waterColor },
    waterGlintColor: { ...settings.waterGlintColor },
    waterSpecularColor: { ...settings.waterSpecularColor },
    waterFoamColorA: { ...settings.waterFoamColorA },
    waterFoamColorB: { ...settings.waterFoamColorB },
  };
}

/**
 * Copy into an existing settings object (e.g. Tweakpane's bound params) without
 * replacing nested object identities for colors.
 */
export function assignWaterSettings(
  target: WaterSettings,
  source: WaterSettings,
): void {
  const {
    waterColor,
    waterGlintColor,
    waterSpecularColor,
    waterFoamColorA,
    waterFoamColorB,
    ...rest
  } = source;
  Object.assign(target, rest);
  Object.assign(target.waterColor, waterColor);
  Object.assign(target.waterGlintColor, waterGlintColor);
  Object.assign(target.waterSpecularColor, waterSpecularColor);
  Object.assign(target.waterFoamColorA, waterFoamColorA);
  Object.assign(target.waterFoamColorB, waterFoamColorB);
}

function clampSettings(settings: WaterSettings): WaterSettings {
  const glintNMin = Math.min(1.25, Math.max(0, settings.waterGlintNormalMin));
  let glintNMax = Math.min(1.25, Math.max(0, settings.waterGlintNormalMax));
  if (glintNMax <= glintNMin) glintNMax = glintNMin + 0.005;

  return {
    waterFill: Math.min(0.95, Math.max(0.05, settings.waterFill)),
    maskThreshold: Math.min(0.95, Math.max(0.05, settings.maskThreshold)),
    maskFeather: Math.min(0.2, Math.max(0.001, settings.maskFeather)),
    renderScale: Math.min(2.5, Math.max(0.5, settings.renderScale)),
    simSize: Math.min(768, Math.max(128, Math.round(settings.simSize))),
    waveSpeed: Math.min(0.9, Math.max(0.05, settings.waveSpeed)),
    damping: Math.min(0.999, Math.max(0.9, settings.damping)),
    restoringForce: Math.min(0.08, Math.max(0, settings.restoringForce)),
    motionImpulse: Math.min(3, Math.max(0, settings.motionImpulse)),
    // Edge-impulse clamps (values unused by sim while edge path is commented out).
    edgeImpulse: Math.min(2, Math.max(0, settings.edgeImpulse)),
    edgeRippleSpatialScale: Math.min(
      4,
      Math.max(0.05, settings.edgeRippleSpatialScale),
    ),
    edgeRippleTimeScale: Math.min(5, Math.max(0, settings.edgeRippleTimeScale)),
    maskEdgeGain: Math.min(12, Math.max(0, settings.maskEdgeGain)),
    surfaceSplash: Math.min(4, Math.max(0, settings.surfaceSplash)),
    surfaceWidth: Math.min(0.1, Math.max(0.002, settings.surfaceWidth)),
    surfaceNoiseAmplitude: Math.min(
      0.05,
      Math.max(0, settings.surfaceNoiseAmplitude),
    ),
    surfaceNoiseFrequency: Math.min(
      6,
      Math.max(0, settings.surfaceNoiseFrequency),
    ),
    surfaceChopAmplitude: Math.min(
      0.18,
      Math.max(0, settings.surfaceChopAmplitude),
    ),
    surfaceChopFrequency: Math.min(
      12,
      Math.max(0, settings.surfaceChopFrequency),
    ),
    waterBrightness: Math.min(2, Math.max(0.2, settings.waterBrightness)),
    waterAlpha: Math.min(1, Math.max(0.1, settings.waterAlpha)),
    waterColor: {
      r: Math.min(1, Math.max(0, settings.waterColor.r)),
      g: Math.min(1, Math.max(0, settings.waterColor.g)),
      b: Math.min(1, Math.max(0, settings.waterColor.b)),
    },
    waterGlint: Math.min(2.5, Math.max(0, settings.waterGlint)),
    waterGlintColor: {
      r: Math.min(1, Math.max(0, settings.waterGlintColor.r)),
      g: Math.min(1, Math.max(0, settings.waterGlintColor.g)),
      b: Math.min(1, Math.max(0, settings.waterGlintColor.b)),
    },
    waterGlintNormalMin: glintNMin,
    waterGlintNormalMax: glintNMax,
    waterSpecular: Math.min(2.5, Math.max(0, settings.waterSpecular)),
    waterSpecularColor: {
      r: Math.min(1, Math.max(0, settings.waterSpecularColor.r)),
      g: Math.min(1, Math.max(0, settings.waterSpecularColor.g)),
      b: Math.min(1, Math.max(0, settings.waterSpecularColor.b)),
    },
    waterSpecularShininess: Math.min(
      200,
      Math.max(4, settings.waterSpecularShininess),
    ),
    waterSpecularSheenWeight: Math.min(
      2,
      Math.max(0, settings.waterSpecularSheenWeight),
    ),
    waterSpecularSheenPower: Math.min(
      64,
      Math.max(2, settings.waterSpecularSheenPower),
    ),
    waterSpecularCouplingFlat: Math.min(
      2.5,
      Math.max(0, settings.waterSpecularCouplingFlat),
    ),
    waterSpecularCouplingGlint: Math.min(
      2.5,
      Math.max(0, settings.waterSpecularCouplingGlint),
    ),
    waterSpecularLightX: Math.min(
      3,
      Math.max(-3, settings.waterSpecularLightX),
    ),
    waterSpecularLightY: Math.min(
      3,
      Math.max(-3, settings.waterSpecularLightY),
    ),
    waterSpecularLightZ: Math.min(
      3,
      Math.max(-3, settings.waterSpecularLightZ),
    ),
    waterSpecularNormalScale: Math.min(
      12,
      Math.max(0.25, settings.waterSpecularNormalScale),
    ),
    waterFoam: Math.min(2.5, Math.max(0, settings.waterFoam)),
    waterFoamColorA: {
      r: Math.min(1, Math.max(0, settings.waterFoamColorA.r)),
      g: Math.min(1, Math.max(0, settings.waterFoamColorA.g)),
      b: Math.min(1, Math.max(0, settings.waterFoamColorA.b)),
    },
    waterFoamColorB: {
      r: Math.min(1, Math.max(0, settings.waterFoamColorB.r)),
      g: Math.min(1, Math.max(0, settings.waterFoamColorB.g)),
      b: Math.min(1, Math.max(0, settings.waterFoamColorB.b)),
    },
    waterSaturation: Math.min(2, Math.max(0, settings.waterSaturation)),
    waterSurfaceBlend: Math.min(
      0.08,
      Math.max(0.002, settings.waterSurfaceBlend),
    ),
    waterRefraction: Math.min(0.1, Math.max(0, settings.waterRefraction)),
    maskTemporalHalfLifeMs: Math.min(
      800,
      Math.max(0, settings.maskTemporalHalfLifeMs),
    ),
    maskBlurRadius: Math.min(
      24,
      Math.max(0, Math.round(settings.maskBlurRadius)),
    ),
  };
}

const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 vUv;

void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const SIMULATION_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uState;
uniform sampler2D uMask;
uniform sampler2D uPrevMask;
uniform vec2 uTexel;
uniform float uWaterlineTop;
uniform float uImpulse;
uniform float uTime;
uniform float uMaskThreshold;
uniform float uWaveSpeed;
uniform float uDamping;
uniform float uRestoringForce;
uniform float uMotionImpulse;
// Edge impulse uniforms (unused while edge impulse is disabled below)
// uniform float uEdgeImpulse;
// uniform float uEdgeRippleSpatial;
// uniform float uEdgeRippleTime;
// uniform float uMaskEdgeGain;
uniform float uSurfaceSplash;
uniform float uSurfaceWidth;

float personMask(sampler2D tex, vec2 uv) {
  vec2 imageUv = vec2(1.0 - uv.x, 1.0 - uv.y);
  return texture(tex, imageUv).r;
}

void main() {
  vec2 state = texture(uState, vUv).rg;
  float h = state.r;
  float velocity = state.g;

  float left = texture(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float right = texture(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float down = texture(uState, vUv - vec2(0.0, uTexel.y)).r;
  float up = texture(uState, vUv + vec2(0.0, uTexel.y)).r;
  float laplacian = left + right + down + up - 4.0 * h;

  vec2 imageUv = vec2(1.0 - vUv.x, 1.0 - vUv.y);
  float mask = texture(uMask, imageUv).r;
  float prevMask = texture(uPrevMask, imageUv).r;
  float inPerson = step(uMaskThreshold, mask);
  float inWater = inPerson * step(uWaterlineTop, imageUv.y);
  float surfaceBand = exp(-pow((imageUv.y - uWaterlineTop) / uSurfaceWidth, 2.0)) * inPerson;

  // --- Edge impulse: mask-gradient + ripple modulation (disabled; body impulse only) ---
  // float maskLeft = personMask(uMask, vUv - vec2(uTexel.x, 0.0));
  // float maskRight = personMask(uMask, vUv + vec2(uTexel.x, 0.0));
  // float maskDown = personMask(uMask, vUv - vec2(0.0, uTexel.y));
  // float maskUp = personMask(uMask, vUv + vec2(0.0, uTexel.y));
  // float edge = min(1.0, length(vec2(maskRight - maskLeft, maskUp - maskDown)) * uMaskEdgeGain);
  float motion = abs(mask - prevMask);
  // float rippleSeed = sin((
  //   vUv.x * 71.0 * uEdgeRippleSpatial +
  //   vUv.y * 113.0 * uEdgeRippleSpatial +
  //   uTime * 0.001 * uEdgeRippleTime
  // ) * 6.28318) * 0.5 + 0.5;
  float slosh = sin((vUv.x * 18.0 + uTime * 0.006) + h * 5.0) * 0.04 * surfaceBand;
  // Was: surfaceBand * (0.45 + edge * 0.55) * (motion * 1.4 + 0.18 * rippleSeed + slosh);
  float surfaceKick = surfaceBand * 0.45 * (motion * 1.4 + slosh);
  // Was: (motion * uMotionImpulse + edge * uEdgeImpulse * rippleSeed) * uImpulse * inWater;
  float disturbance = motion * uMotionImpulse * uImpulse * inWater;
  disturbance += surfaceKick * uImpulse * uSurfaceSplash;

  velocity += laplacian * uWaveSpeed;
  velocity += disturbance;
  velocity -= h * uRestoringForce;
  velocity *= uDamping;
  h += velocity;

  float contain = mix(0.92, 1.0, inWater);
  h *= contain;
  velocity *= contain;

  outColor = vec4(h, velocity, 0.0, 1.0);
}`;

const COMPOSITE_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uWaterlineTop;
uniform float uTime;
uniform float uMaskThreshold;
uniform float uMaskFeather;
uniform float uSurfaceNoiseAmp;
uniform float uSurfaceNoiseFreq;
uniform float uSurfaceChopAmp;
uniform float uSurfaceChopFreq;
uniform float uSurfaceWidth;
uniform float uWaterBrightness;
uniform float uWaterAlpha;
uniform vec3 uWaterBase;
uniform float uWaterGlint;
uniform vec3 uWaterGlintTint;
uniform float uWaterGlintEdge0;
uniform float uWaterGlintEdge1;
uniform float uWaterSpecular;
uniform vec3 uWaterSpecularTint;
uniform float uWaterSpecularShininess;
uniform float uWaterSpecularSheenWeight;
uniform float uWaterSpecularSheenPower;
uniform float uWaterSpecularCouplingFlat;
uniform float uWaterSpecularCouplingGlint;
uniform vec3 uWaterSpecularLight;
uniform float uWaterSpecularNormalScale;
uniform float uWaterFoam;
uniform vec3 uWaterFoamA;
uniform vec3 uWaterFoamB;
uniform float uWaterSaturation;
uniform float uWaterSurfaceBlend;
uniform float uWaterRefraction;

vec4 cameraColor(vec2 uv) {
  vec2 imageUv = vec2(1.0 - uv.x, 1.0 - uv.y);
  return texture(uVideo, imageUv);
}

vec3 cameraColorRefracted(
  vec2 uv,
  vec2 normalXY,
  float personEdge,
  float surfaceDistance
) {
  float below = smoothstep(-0.004, 0.03, surfaceDistance);
  float depth = clamp(surfaceDistance * 4.5, 0.0, 1.0);
  float edge = mix(0.3, 1.0, smoothstep(0.15, 0.92, personEdge));
  float mag =
    uWaterRefraction * below * (0.22 + 0.78 * depth) * edge;
  vec2 off = vec2(-normalXY.x, -normalXY.y) * mag;
  return cameraColor(uv + off).rgb;
}

float maskValue(vec2 uv) {
  vec2 imageUv = vec2(1.0 - uv.x, 1.0 - uv.y);
  return texture(uMask, imageUv).r;
}

void main() {
  vec2 imageUv = vec2(1.0 - vUv.x, 1.0 - vUv.y);
  float mask = texture(uMask, imageUv).r;
  // Feather only the outer (background) side of the threshold so wide bands do not
  // pull interior mask values into a mid-alpha ramp (which dims the whole silhouette).
  float innerEdge = uMaskThreshold + max(0.002, min(0.05, uMaskFeather * 0.2));
  float personAlpha = smoothstep(uMaskThreshold - uMaskFeather, innerEdge, mask);

  if (personAlpha <= 0.001) {
    outColor = vec4(cameraColor(vUv).rgb, 1.0);
    return;
  }

  float h = texture(uState, vUv).r;
  float nFreq = uSurfaceNoiseFreq;
  float surfaceNoise =
    sin(vUv.x * 31.0 * nFreq + uTime * 0.004 * nFreq) * uSurfaceNoiseAmp +
    sin(vUv.x * 67.0 * nFreq - uTime * 0.007 * nFreq) * uSurfaceNoiseAmp * 0.5;
  float chopWobble =
    1.0 + 0.4 * sin(vUv.x * 20.0 * uSurfaceChopFreq + uTime * 0.003 * uSurfaceChopFreq);
  float surfaceHeight =
    clamp(uWaterlineTop + h * uSurfaceChopAmp * chopWobble + surfaceNoise, 0.0, 1.0);
  float surfaceDistance = imageUv.y - surfaceHeight;

  if (surfaceDistance < -0.004) {
    // Full camera here — multiplying by personAlpha darkened edges/background to black.
    outColor = vec4(cameraColor(vUv).rgb, 1.0);
    return;
  }

  float hL = texture(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture(uState, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture(uState, vUv + vec2(0.0, uTexel.y)).r;
  vec2 normal = vec2(hR - hL, hD - hU);

  float glint = smoothstep(uWaterGlintEdge0, uWaterGlintEdge1, length(normal));
  vec3 N = normalize(
    vec3(-normal.x * uWaterSpecularNormalScale, -normal.y * uWaterSpecularNormalScale, 1.0)
  );
  vec3 L = length(uWaterSpecularLight) > 1e-4
    ? normalize(uWaterSpecularLight)
    : vec3(0.34, 0.4, 0.85);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float nh = max(0.0, dot(N, H));
  float specCoupling = uWaterSpecularCouplingFlat + uWaterSpecularCouplingGlint * glint;
  float specular =
    (pow(nh, uWaterSpecularShininess) +
      pow(nh, uWaterSpecularSheenPower) * uWaterSpecularSheenWeight) *
    uWaterSpecular * specCoupling;
  vec3 color = (uWaterBase + uWaterGlintTint * glint * uWaterGlint) * uWaterBrightness;
  float surfaceLine = exp(-pow(surfaceDistance / max(0.002, uSurfaceWidth * 0.28), 2.0));
  float splash = surfaceLine * smoothstep(0.015, 0.14, abs(h) + length(normal) * 0.7);
  color += uWaterFoamA * surfaceLine * uWaterFoam;
  color += uWaterFoamB * splash * uWaterFoam;

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, clamp(uWaterSaturation, 0.0, 2.0));
  color += uWaterSpecularTint * specular * uWaterBrightness;

  float airNear = uWaterSurfaceBlend * 0.375;
  float airFar = uWaterSurfaceBlend * 1.625;
  float airFade = smoothstep(surfaceHeight - airNear, surfaceHeight + airFar, imageUv.y);
  vec3 topColor =
    cameraColorRefracted(vUv, normal, personAlpha, surfaceDistance);
  color = mix(topColor, color, airFade * uWaterAlpha);

  // Blend silhouette to camera by mask — avoid color * personAlpha (crushes to black on edges).
  vec3 composited = mix(cameraColor(vUv).rgb, color, personAlpha);
  outColor = vec4(composited, 1.0);
}`;

function assertWebGL2(
  context: WebGLRenderingContext | null,
): asserts context is GL {
  if (!(context instanceof WebGL2RenderingContext)) {
    throw new Error("This prototype requires WebGL2.");
  }
}

function createTexture(gl: GL, width: number, height: number): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Could not create texture.");

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );

  return texture;
}

function createFloatTarget(
  gl: GL,
  width: number,
  height: number,
): RenderTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    throw new Error("Could not create water simulation target.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    width,
    height,
    0,
    gl.RGBA,
    gl.FLOAT,
    new Float32Array(width * height * 4),
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Float framebuffer is not supported on this device.");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { texture, framebuffer, width, height };
}

export class WaterRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: GL;
  private readonly quad: twgl.BufferInfo;
  private readonly simProgram: twgl.ProgramInfo;
  private readonly compositeProgram: twgl.ProgramInfo;
  private readonly videoTexture: WebGLTexture;
  private readonly maskTexture: WebGLTexture;
  private readonly previousMaskTexture: WebGLTexture;
  private readTarget: RenderTarget;
  private writeTarget: RenderTarget;
  /** Latest mask from segmentation (may update at a low rate). */
  private targetMask: MaskFrame | null = null;
  /** GPU-facing mask after temporal easing (same size as video mask). */
  private displayMask: ImageData | null = null;
  /** Copy of the mask uploaded last frame (for motion / edge detection). */
  private prevDisplayMask: ImageData | null = null;
  private lastMaskRenderTime = 0;
  private settings = DEFAULT_WATER_SETTINGS;
  private pendingImpulse = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = twgl.getContext(canvas, {
      alpha: false,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
    });
    assertWebGL2(context);

    this.gl = context;
    if (!this.gl.getExtension("EXT_color_buffer_float")) {
      throw new Error(
        "EXT_color_buffer_float is required for the water simulation.",
      );
    }

    this.quad = twgl.createBufferInfoFromArrays(this.gl, {
      position: {
        numComponents: 2,
        data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
      },
    });
    this.simProgram = twgl.createProgramInfo(this.gl, [
      VERTEX_SHADER,
      SIMULATION_SHADER,
    ]);
    this.compositeProgram = twgl.createProgramInfo(this.gl, [
      VERTEX_SHADER,
      COMPOSITE_SHADER,
    ]);

    this.videoTexture = createTexture(this.gl, 1, 1);
    this.maskTexture = createTexture(this.gl, 1, 1);
    this.previousMaskTexture = createTexture(this.gl, 1, 1);
    this.readTarget = createFloatTarget(
      this.gl,
      this.settings.simSize,
      this.settings.simSize,
    );
    this.writeTarget = createFloatTarget(
      this.gl,
      this.settings.simSize,
      this.settings.simSize,
    );

    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.BLEND);
  }

  setSettings(settings: WaterSettings): void {
    const next = clampSettings(settings);
    const simSizeChanged = next.simSize !== this.settings.simSize;
    this.settings = next;

    if (simSizeChanged) {
      this.resizeSimulation(next.simSize);
    }
  }

  setMaskFrame(frame: MaskFrame | null): void {
    if (!frame) {
      this.targetMask = null;
      this.displayMask = null;
      this.prevDisplayMask = null;
      this.lastMaskRenderTime = 0;
      return;
    }

    const sizeChanged =
      !this.displayMask ||
      this.displayMask.width !== frame.width ||
      this.displayMask.height !== frame.height;

    this.targetMask = frame;

    if (sizeChanged) {
      this.displayMask = new ImageData(
        new Uint8ClampedArray(frame.imageData.data),
        frame.width,
        frame.height,
      );
      this.prevDisplayMask = new ImageData(
        new Uint8ClampedArray(frame.imageData.data),
        frame.width,
        frame.height,
      );
      this.lastMaskRenderTime = 0;
    }

    this.pendingImpulse = true;
  }

  render(video: HTMLVideoElement, now: number): void {
    const width = Math.trunc(video.videoWidth);
    const height = Math.trunc(video.videoHeight);
    if (width < 1 || height < 1) return;

    const renderWidth = Math.max(
      1,
      Math.round(width * this.settings.renderScale),
    );
    const renderHeight = Math.max(
      1,
      Math.round(height * this.settings.renderScale),
    );
    if (this.canvas.width !== renderWidth) this.canvas.width = renderWidth;
    if (this.canvas.height !== renderHeight) this.canvas.height = renderHeight;

    this.uploadVideo(video);
    if (this.targetMask && this.displayMask && this.prevDisplayMask) {
      this.updateDisplayMaskForFrame(now);
      this.uploadImageData(this.previousMaskTexture, this.prevDisplayMask);
      this.uploadImageData(this.maskTexture, this.displayMask);
      this.stepSimulation(now);
    }
    this.composite();
  }

  dispose(): void {
    const gl = this.gl;
    for (const texture of [
      this.videoTexture,
      this.maskTexture,
      this.previousMaskTexture,
      this.readTarget.texture,
      this.writeTarget.texture,
    ]) {
      gl.deleteTexture(texture);
    }
    gl.deleteFramebuffer(this.readTarget.framebuffer);
    gl.deleteFramebuffer(this.writeTarget.framebuffer);
  }

  private resizeSimulation(size: number): void {
    const gl = this.gl;
    gl.deleteTexture(this.readTarget.texture);
    gl.deleteTexture(this.writeTarget.texture);
    gl.deleteFramebuffer(this.readTarget.framebuffer);
    gl.deleteFramebuffer(this.writeTarget.framebuffer);
    this.readTarget = createFloatTarget(gl, size, size);
    this.writeTarget = createFloatTarget(gl, size, size);
    this.pendingImpulse = true;
  }

  private uploadVideo(video: HTMLVideoElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  private uploadImageData(texture: WebGLTexture, imageData: ImageData): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      imageData.width,
      imageData.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData.data,
    );
  }

  private updateDisplayMaskForFrame(now: number): void {
    if (!this.targetMask || !this.displayMask || !this.prevDisplayMask) return;

    this.prevDisplayMask.data.set(this.displayMask.data);

    const dtSec =
      this.lastMaskRenderTime > 0
        ? Math.min(0.25, (now - this.lastMaskRenderTime) / 1000)
        : 1 / 60;
    this.lastMaskRenderTime = now;

    const tauMs = this.settings.maskTemporalHalfLifeMs;
    const k = tauMs <= 0 ? 1 : 1 - Math.exp(-(dtSec * 1000) / tauMs);

    const src = this.targetMask.imageData.data;
    const dst = this.displayMask.data;
    for (let i = 0; i < src.length; i += 4) {
      const a = dst[i] / 255;
      const b = src[i] / 255;
      const m = a + (b - a) * k;
      const v = Math.round(Math.min(1, Math.max(0, m)) * 255);
      dst[i] = v;
      dst[i + 1] = v;
      dst[i + 2] = v;
      dst[i + 3] = 255;
    }
  }

  private waterlineTop(): number {
    const bounds = this.targetMask?.bounds;
    const height = this.targetMask?.height ?? 1;
    if (!bounds) return 1 - this.settings.waterFill;

    const personHeight = Math.max(1, bounds.bottom - bounds.top + 1);
    return (bounds.top + personHeight * (1 - this.settings.waterFill)) / height;
  }

  private stepSimulation(now: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeTarget.framebuffer);
    gl.viewport(0, 0, this.writeTarget.width, this.writeTarget.height);
    gl.useProgram(this.simProgram.program);
    twgl.setBuffersAndAttributes(gl, this.simProgram, this.quad);
    twgl.setUniforms(this.simProgram, {
      uState: this.readTarget.texture,
      uMask: this.maskTexture,
      uPrevMask: this.previousMaskTexture,
      uTexel: [1 / this.readTarget.width, 1 / this.readTarget.height],
      uWaterlineTop: this.waterlineTop(),
      uImpulse: this.pendingImpulse ? 1 : 0,
      uTime: now,
      uMaskThreshold: this.settings.maskThreshold,
      uWaveSpeed: this.settings.waveSpeed,
      uDamping: this.settings.damping,
      uRestoringForce: this.settings.restoringForce,
      uMotionImpulse: this.settings.motionImpulse,
      // uEdgeImpulse: this.settings.edgeImpulse,
      // uEdgeRippleSpatial: this.settings.edgeRippleSpatialScale,
      // uEdgeRippleTime: this.settings.edgeRippleTimeScale,
      // uMaskEdgeGain: this.settings.maskEdgeGain,
      uSurfaceSplash: this.settings.surfaceSplash,
      uSurfaceWidth: this.settings.surfaceWidth,
    });
    twgl.drawBufferInfo(gl, this.quad);

    const tmp = this.readTarget;
    this.readTarget = this.writeTarget;
    this.writeTarget = tmp;
    this.pendingImpulse = false;
  }

  private composite(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.compositeProgram.program);
    twgl.setBuffersAndAttributes(gl, this.compositeProgram, this.quad);
    twgl.setUniforms(this.compositeProgram, {
      uVideo: this.videoTexture,
      uMask: this.maskTexture,
      uState: this.readTarget.texture,
      uTexel: [1 / this.readTarget.width, 1 / this.readTarget.height],
      uWaterlineTop: this.waterlineTop(),
      uTime: performance.now(),
      uMaskThreshold: this.settings.maskThreshold,
      uMaskFeather: this.settings.maskFeather,
      uSurfaceNoiseAmp: this.settings.surfaceNoiseAmplitude,
      uSurfaceNoiseFreq: this.settings.surfaceNoiseFrequency,
      uSurfaceChopAmp: this.settings.surfaceChopAmplitude,
      uSurfaceChopFreq: this.settings.surfaceChopFrequency,
      uSurfaceWidth: this.settings.surfaceWidth,
      uWaterBrightness: this.settings.waterBrightness,
      uWaterAlpha: this.settings.waterAlpha,
      uWaterBase: [
        this.settings.waterColor.r,
        this.settings.waterColor.g,
        this.settings.waterColor.b,
      ],
      uWaterGlint: this.settings.waterGlint,
      uWaterGlintTint: [
        this.settings.waterGlintColor.r,
        this.settings.waterGlintColor.g,
        this.settings.waterGlintColor.b,
      ],
      uWaterGlintEdge0: this.settings.waterGlintNormalMin,
      uWaterGlintEdge1: this.settings.waterGlintNormalMax,
      uWaterSpecular: this.settings.waterSpecular,
      uWaterSpecularTint: [
        this.settings.waterSpecularColor.r,
        this.settings.waterSpecularColor.g,
        this.settings.waterSpecularColor.b,
      ],
      uWaterSpecularShininess: this.settings.waterSpecularShininess,
      uWaterSpecularSheenWeight: this.settings.waterSpecularSheenWeight,
      uWaterSpecularSheenPower: this.settings.waterSpecularSheenPower,
      uWaterSpecularCouplingFlat: this.settings.waterSpecularCouplingFlat,
      uWaterSpecularCouplingGlint: this.settings.waterSpecularCouplingGlint,
      uWaterSpecularLight: [
        this.settings.waterSpecularLightX,
        this.settings.waterSpecularLightY,
        this.settings.waterSpecularLightZ,
      ],
      uWaterSpecularNormalScale: this.settings.waterSpecularNormalScale,
      uWaterFoam: this.settings.waterFoam,
      uWaterFoamA: [
        this.settings.waterFoamColorA.r,
        this.settings.waterFoamColorA.g,
        this.settings.waterFoamColorA.b,
      ],
      uWaterFoamB: [
        this.settings.waterFoamColorB.r,
        this.settings.waterFoamColorB.g,
        this.settings.waterFoamColorB.b,
      ],
      uWaterSaturation: this.settings.waterSaturation,
      uWaterSurfaceBlend: this.settings.waterSurfaceBlend,
      uWaterRefraction: this.settings.waterRefraction,
    });
    twgl.drawBufferInfo(gl, this.quad);
  }
}
