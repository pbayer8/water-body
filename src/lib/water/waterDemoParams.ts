import {
  cloneWaterSettings,
  DEFAULT_WATER_SETTINGS,
  type WaterSettings,
} from "@/lib/water/waterRenderer";

/** Linear RGB as used by Tweakpane `color: { type: "float" }`. */
export type WaterLinearRgb = { r: number; g: number; b: number };

/**
 * Single nested params object bound by Tweakpane (folders mirror top-level keys).
 * Values absent here fall back to {@link DEFAULT_WATER_SETTINGS} when building {@link WaterSettings}.
 */
export type WaterDemoParams = {
  resolution: {
    renderScale: number;
    simSize: number;
  };
  bodyMask: {
    maskThreshold: number;
    maskFeather: number;
    maskTemporalHalfLifeMs: number;
    maskBlurRadius: number;
    waterFill: number;
  };
  physics: {
    waveSpeed: number;
    damping: number;
    restoringForce: number;
    motionImpulse: number;
  };
  surface: {
    surfaceSplash: number;
    surfaceWidth: number;
    surfaceNoiseAmplitude: number;
    surfaceNoiseFrequency: number;
    surfaceChopAmplitude: number;
    surfaceChopFrequency: number;
  };
  water: {
    waterBrightness: number;
    waterAlpha: number;
    waterRefraction: number;
  };
  glint: {
    waterGlintColor: WaterLinearRgb;
    waterGlint: number;
    waterGlintNormalMin: number;
    waterGlintNormalMax: number;
  };
  specular: {
    waterSpecularColor: WaterLinearRgb;
    waterSpecular: number;
    waterSpecularShininess: number;
    waterSpecularSheenWeight: number;
    waterSpecularSheenPower: number;
    waterSpecularCouplingFlat: number;
    waterSpecularCouplingGlint: number;
    waterSpecularLightX: number;
    waterSpecularLightY: number;
    waterSpecularLightZ: number;
    waterSpecularNormalScale: number;
  };
  tintFinish: {
    waterColor: WaterLinearRgb;
    waterFoam: number;
    waterFoamColorA: WaterLinearRgb;
    waterFoamColorB: WaterLinearRgb;
    waterSaturation: number;
    waterSurfaceBlend: number;
  };
};

/** Nested partials: every folder and field optional; RGB patches merge per channel. */
export type WaterDemoParamsPresetPatch = {
  resolution?: Partial<WaterDemoParams["resolution"]>;
  bodyMask?: Partial<WaterDemoParams["bodyMask"]>;
  physics?: Partial<WaterDemoParams["physics"]>;
  surface?: Partial<WaterDemoParams["surface"]>;
  water?: Partial<WaterDemoParams["water"]>;
  glint?: {
    waterGlintColor?: Partial<WaterLinearRgb>;
    waterGlint?: number;
    waterGlintNormalMin?: number;
    waterGlintNormalMax?: number;
  };
  specular?: {
    waterSpecularColor?: Partial<WaterLinearRgb>;
    waterSpecular?: number;
    waterSpecularShininess?: number;
    waterSpecularSheenWeight?: number;
    waterSpecularSheenPower?: number;
    waterSpecularCouplingFlat?: number;
    waterSpecularCouplingGlint?: number;
    waterSpecularLightX?: number;
    waterSpecularLightY?: number;
    waterSpecularLightZ?: number;
    waterSpecularNormalScale?: number;
  };
  tintFinish?: {
    waterColor?: Partial<WaterLinearRgb>;
    waterFoam?: number;
    waterFoamColorA?: Partial<WaterLinearRgb>;
    waterFoamColorB?: Partial<WaterLinearRgb>;
    waterSaturation?: number;
    waterSurfaceBlend?: number;
  };
};

export function waterSettingsToDemoParams(s: WaterSettings): WaterDemoParams {
  return {
    resolution: {
      renderScale: s.renderScale,
      simSize: s.simSize,
    },
    bodyMask: {
      maskThreshold: s.maskThreshold,
      maskFeather: s.maskFeather,
      maskTemporalHalfLifeMs: s.maskTemporalHalfLifeMs,
      maskBlurRadius: s.maskBlurRadius,
      waterFill: s.waterFill,
    },
    physics: {
      waveSpeed: s.waveSpeed,
      damping: s.damping,
      restoringForce: s.restoringForce,
      motionImpulse: s.motionImpulse,
    },
    surface: {
      surfaceSplash: s.surfaceSplash,
      surfaceWidth: s.surfaceWidth,
      surfaceNoiseAmplitude: s.surfaceNoiseAmplitude,
      surfaceNoiseFrequency: s.surfaceNoiseFrequency,
      surfaceChopAmplitude: s.surfaceChopAmplitude,
      surfaceChopFrequency: s.surfaceChopFrequency,
    },
    water: {
      waterBrightness: s.waterBrightness,
      waterAlpha: s.waterAlpha,
      waterRefraction: s.waterRefraction,
    },
    glint: {
      waterGlintColor: { ...s.waterGlintColor },
      waterGlint: s.waterGlint,
      waterGlintNormalMin: s.waterGlintNormalMin,
      waterGlintNormalMax: s.waterGlintNormalMax,
    },
    specular: {
      waterSpecularColor: { ...s.waterSpecularColor },
      waterSpecular: s.waterSpecular,
      waterSpecularShininess: s.waterSpecularShininess,
      waterSpecularSheenWeight: s.waterSpecularSheenWeight,
      waterSpecularSheenPower: s.waterSpecularSheenPower,
      waterSpecularCouplingFlat: s.waterSpecularCouplingFlat,
      waterSpecularCouplingGlint: s.waterSpecularCouplingGlint,
      waterSpecularLightX: s.waterSpecularLightX,
      waterSpecularLightY: s.waterSpecularLightY,
      waterSpecularLightZ: s.waterSpecularLightZ,
      waterSpecularNormalScale: s.waterSpecularNormalScale,
    },
    tintFinish: {
      waterColor: { ...s.waterColor },
      waterFoam: s.waterFoam,
      waterFoamColorA: { ...s.waterFoamColorA },
      waterFoamColorB: { ...s.waterFoamColorB },
      waterSaturation: s.waterSaturation,
      waterSurfaceBlend: s.waterSurfaceBlend,
    },
  };
}

export const DEFAULT_WATER_DEMO_PARAMS: WaterDemoParams =
  waterSettingsToDemoParams(DEFAULT_WATER_SETTINGS);

/** Deep clone for immutable React snapshots. */
export function cloneDemoParams(p: WaterDemoParams): WaterDemoParams {
  return structuredClone(p);
}

function mergeRgb(
  target: WaterLinearRgb,
  patch?: Partial<WaterLinearRgb>,
): void {
  if (!patch) return;
  if (patch.r !== undefined) target.r = patch.r;
  if (patch.g !== undefined) target.g = patch.g;
  if (patch.b !== undefined) target.b = patch.b;
}

/**
 * Copy demo params into `target` without replacing nested RGB object identities
 * (so Tweakpane bindings stay stable).
 */
export function assignDemoParams(
  target: WaterDemoParams,
  source: WaterDemoParams,
): void {
  Object.assign(target.resolution, source.resolution);
  Object.assign(target.bodyMask, source.bodyMask);
  Object.assign(target.physics, source.physics);
  Object.assign(target.surface, source.surface);
  Object.assign(target.water, source.water);

  Object.assign(target.glint, {
    waterGlint: source.glint.waterGlint,
    waterGlintNormalMin: source.glint.waterGlintNormalMin,
    waterGlintNormalMax: source.glint.waterGlintNormalMax,
  });
  Object.assign(target.glint.waterGlintColor, source.glint.waterGlintColor);

  Object.assign(target.specular, {
    waterSpecular: source.specular.waterSpecular,
    waterSpecularShininess: source.specular.waterSpecularShininess,
    waterSpecularSheenWeight: source.specular.waterSpecularSheenWeight,
    waterSpecularSheenPower: source.specular.waterSpecularSheenPower,
    waterSpecularCouplingFlat: source.specular.waterSpecularCouplingFlat,
    waterSpecularCouplingGlint: source.specular.waterSpecularCouplingGlint,
    waterSpecularLightX: source.specular.waterSpecularLightX,
    waterSpecularLightY: source.specular.waterSpecularLightY,
    waterSpecularLightZ: source.specular.waterSpecularLightZ,
    waterSpecularNormalScale: source.specular.waterSpecularNormalScale,
  });
  Object.assign(
    target.specular.waterSpecularColor,
    source.specular.waterSpecularColor,
  );

  Object.assign(target.tintFinish, {
    waterFoam: source.tintFinish.waterFoam,
    waterSaturation: source.tintFinish.waterSaturation,
    waterSurfaceBlend: source.tintFinish.waterSurfaceBlend,
  });
  Object.assign(target.tintFinish.waterColor, source.tintFinish.waterColor);
  Object.assign(
    target.tintFinish.waterFoamColorA,
    source.tintFinish.waterFoamColorA,
  );
  Object.assign(
    target.tintFinish.waterFoamColorB,
    source.tintFinish.waterFoamColorB,
  );
}

export function applyDemoParamsPresetPatch(
  target: WaterDemoParams,
  patch: WaterDemoParamsPresetPatch,
): void {
  if (patch.resolution) Object.assign(target.resolution, patch.resolution);
  if (patch.bodyMask) Object.assign(target.bodyMask, patch.bodyMask);
  if (patch.physics) Object.assign(target.physics, patch.physics);
  if (patch.surface) Object.assign(target.surface, patch.surface);
  if (patch.water) Object.assign(target.water, patch.water);

  if (patch.glint) {
    const { waterGlintColor, ...glintRest } = patch.glint;
    Object.assign(target.glint, glintRest);
    mergeRgb(target.glint.waterGlintColor, waterGlintColor);
  }

  if (patch.specular) {
    const { waterSpecularColor, ...specRest } = patch.specular;
    Object.assign(target.specular, specRest);
    mergeRgb(target.specular.waterSpecularColor, waterSpecularColor);
  }

  if (patch.tintFinish) {
    const { waterColor, waterFoamColorA, waterFoamColorB, ...tintRest } =
      patch.tintFinish;
    Object.assign(target.tintFinish, tintRest);
    mergeRgb(target.tintFinish.waterColor, waterColor);
    mergeRgb(target.tintFinish.waterFoamColorA, waterFoamColorA);
    mergeRgb(target.tintFinish.waterFoamColorB, waterFoamColorB);
  }
}

export function mergeDemoParamsWithPreset(
  base: WaterDemoParams,
  patch: WaterDemoParamsPresetPatch,
): WaterDemoParams {
  const out = cloneDemoParams(base);
  applyDemoParamsPresetPatch(out, patch);
  return out;
}

/** Flatten for {@link WaterRenderer}: demo folders overlay defaults (edge sim uniforms stay default). */
export function demoParamsToWaterSettings(d: WaterDemoParams): WaterSettings {
  return cloneWaterSettings({
    ...DEFAULT_WATER_SETTINGS,
    ...d.resolution,
    ...d.bodyMask,
    ...d.physics,
    ...d.surface,
    ...d.water,
    ...d.glint,
    ...d.specular,
    ...d.tintFinish,
  });
}
