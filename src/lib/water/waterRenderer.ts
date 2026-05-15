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
  edgeImpulse: number;
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
  /** Fresnel / normal-highlight strength. */
  waterGlint: number;
  /** Fine moving highlights on the surface. */
  waterShimmer: number;
  /** Bright foam / splash streak along the waterline. */
  waterFoam: number;
  /** 0 = grayscale water, 1 = default, >1 exaggerates chroma. */
  waterSaturation: number;
  /** Width of the air–water blend (matches legacy ~0.016). */
  waterSurfaceBlend: number;
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
  maskThreshold: 0.95,
  maskFeather: 0.001,
  renderScale: 1,
  simSize: 320,
  waveSpeed: 0.2,
  damping: 0.98,
  restoringForce: 0.04,
  motionImpulse: 2,
  edgeImpulse: 1.01,
  surfaceSplash: 1.05,
  surfaceWidth: 0.02,
  surfaceNoiseAmplitude: 0.01,
  surfaceNoiseFrequency: 1,
  surfaceChopAmplitude: 0.015,
  surfaceChopFrequency: 0,
  waterBrightness: 1.6,
  waterAlpha: 0.7,
  waterColor: { r: 0.02, g: 0.18, b: 0.72 },
  waterGlint: 1,
  waterShimmer: 1,
  waterFoam: 1,
  waterSaturation: 1,
  waterSurfaceBlend: 0.016,
  maskTemporalHalfLifeMs: 90,
  maskBlurRadius: 0,
};

/** Clone for React state / immutable snapshots (nested `waterColor` is copied). */
export function cloneWaterSettings(settings: WaterSettings): WaterSettings {
  return { ...settings, waterColor: { ...settings.waterColor } };
}

/**
 * Copy into an existing settings object (e.g. Tweakpane's bound params) without
 * replacing the `waterColor` object identity.
 */
export function assignWaterSettings(
  target: WaterSettings,
  source: WaterSettings,
): void {
  const { waterColor, ...rest } = source;
  Object.assign(target, rest);
  Object.assign(target.waterColor, waterColor);
}

function clampSettings(settings: WaterSettings): WaterSettings {
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
    edgeImpulse: Math.min(2, Math.max(0, settings.edgeImpulse)),
    surfaceSplash: Math.min(4, Math.max(0, settings.surfaceSplash)),
    surfaceWidth: Math.min(0.1, Math.max(0.002, settings.surfaceWidth)),
    surfaceNoiseAmplitude: Math.min(0.05, Math.max(0, settings.surfaceNoiseAmplitude)),
    surfaceNoiseFrequency: Math.min(6, Math.max(0, settings.surfaceNoiseFrequency)),
    surfaceChopAmplitude: Math.min(0.18, Math.max(0, settings.surfaceChopAmplitude)),
    surfaceChopFrequency: Math.min(12, Math.max(0, settings.surfaceChopFrequency)),
    waterBrightness: Math.min(2, Math.max(0.2, settings.waterBrightness)),
    waterAlpha: Math.min(1, Math.max(0.1, settings.waterAlpha)),
    waterColor: {
      r: Math.min(1, Math.max(0, settings.waterColor.r)),
      g: Math.min(1, Math.max(0, settings.waterColor.g)),
      b: Math.min(1, Math.max(0, settings.waterColor.b)),
    },
    waterGlint: Math.min(2.5, Math.max(0, settings.waterGlint)),
    waterShimmer: Math.min(2.5, Math.max(0, settings.waterShimmer)),
    waterFoam: Math.min(2.5, Math.max(0, settings.waterFoam)),
    waterSaturation: Math.min(2, Math.max(0, settings.waterSaturation)),
    waterSurfaceBlend: Math.min(0.08, Math.max(0.002, settings.waterSurfaceBlend)),
    maskTemporalHalfLifeMs: Math.min(800, Math.max(0, settings.maskTemporalHalfLifeMs)),
    maskBlurRadius: Math.min(24, Math.max(0, Math.round(settings.maskBlurRadius))),
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
uniform float uEdgeImpulse;
uniform float uSurfaceSplash;
uniform float uSurfaceWidth;

float personMask(sampler2D tex, vec2 uv) {
  vec2 imageUv = vec2(uv.x, 1.0 - uv.y);
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

  vec2 imageUv = vec2(vUv.x, 1.0 - vUv.y);
  float mask = texture(uMask, imageUv).r;
  float prevMask = texture(uPrevMask, imageUv).r;
  float inPerson = step(uMaskThreshold, mask);
  float inWater = inPerson * step(uWaterlineTop, imageUv.y);
  float surfaceBand = exp(-pow((imageUv.y - uWaterlineTop) / uSurfaceWidth, 2.0)) * inPerson;

  float maskLeft = personMask(uMask, vUv - vec2(uTexel.x, 0.0));
  float maskRight = personMask(uMask, vUv + vec2(uTexel.x, 0.0));
  float maskDown = personMask(uMask, vUv - vec2(0.0, uTexel.y));
  float maskUp = personMask(uMask, vUv + vec2(0.0, uTexel.y));
  float edge = min(1.0, length(vec2(maskRight - maskLeft, maskUp - maskDown)) * 2.5);
  float motion = abs(mask - prevMask);
  float rippleSeed = sin((vUv.x * 71.0 + vUv.y * 113.0 + uTime * 0.001) * 6.28318) * 0.5 + 0.5;
  float slosh = sin((vUv.x * 18.0 + uTime * 0.006) + h * 5.0) * 0.04 * surfaceBand;
  float surfaceKick = surfaceBand * (0.45 + edge * 0.55) * (motion * 1.4 + 0.18 * rippleSeed + slosh);
  float disturbance = (motion * uMotionImpulse + edge * uEdgeImpulse * rippleSeed) * uImpulse * inWater;
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
uniform float uWaterShimmer;
uniform float uWaterFoam;
uniform float uWaterSaturation;
uniform float uWaterSurfaceBlend;

vec4 cameraColor(vec2 uv) {
  vec2 imageUv = vec2(uv.x, 1.0 - uv.y);
  return texture(uVideo, imageUv);
}

float maskValue(vec2 uv) {
  vec2 imageUv = vec2(uv.x, 1.0 - uv.y);
  return texture(uMask, imageUv).r;
}

void main() {
  vec2 imageUv = vec2(vUv.x, 1.0 - vUv.y);
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
  vec2 normal = vec2(hL - hR, hD - hU);

  float glint = smoothstep(0.08, 0.28, length(normal));
  float wave = 0.5 + 0.5 * sin((vUv.y + h * 0.2) * 70.0 + h * 18.0);
  vec3 glintTint = vec3(0.02, 0.07, 0.18);
  vec3 waveTint = vec3(0.015);
  vec3 color =
    (uWaterBase + glintTint * glint * uWaterGlint + waveTint * wave * uWaterShimmer) *
    uWaterBrightness;
  float surfaceLine = exp(-pow(surfaceDistance / max(0.002, uSurfaceWidth * 0.28), 2.0));
  float splash = surfaceLine * smoothstep(0.015, 0.14, abs(h) + length(normal) * 0.7);
  vec3 foamA = vec3(0.05, 0.12, 0.24);
  vec3 foamB = vec3(0.08, 0.18, 0.32);
  color += foamA * surfaceLine * uWaterFoam;
  color += foamB * splash * uWaterFoam;

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, clamp(uWaterSaturation, 0.0, 2.0));

  float airNear = uWaterSurfaceBlend * 0.375;
  float airFar = uWaterSurfaceBlend * 1.625;
  float airFade = smoothstep(surfaceHeight - airNear, surfaceHeight + airFar, imageUv.y);
  vec3 topColor = cameraColor(vUv).rgb;
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
      uEdgeImpulse: this.settings.edgeImpulse,
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
      uWaterShimmer: this.settings.waterShimmer,
      uWaterFoam: this.settings.waterFoam,
      uWaterSaturation: this.settings.waterSaturation,
      uWaterSurfaceBlend: this.settings.waterSurfaceBlend,
    });
    twgl.drawBufferInfo(gl, this.quad);
  }
}
