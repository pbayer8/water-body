import type { WaterDemoParamsPresetPatch } from "@/lib/water/waterDemoParams";

export type WaterLookPreset = {
  id: string;
  label: string;
  /** Visual overrides merged into current demo params when the preset is applied. */
  patch: WaterDemoParamsPresetPatch;
};

export const WATER_LOOK_PRESETS: readonly WaterLookPreset[] = [
  {
    id: "clear-water",
    label: "Clear Water",
    patch: {
      water: {
        waterBrightness: 1.94,
        waterAlpha: 0.48,
        waterRefraction: 0.018,
      },
      tintFinish: {
        waterSaturation: 0.76,
        waterColor: { r: 0.38, g: 0.78, b: 0.93 },
        waterFoam: 1.1,
        waterFoamColorA: { r: 0.82, g: 0.92, b: 0.96 },
        waterFoamColorB: { r: 0.74, g: 0.86, b: 0.93 },
        waterSurfaceBlend: 0.008,
      },
      surface: {
        surfaceWidth: 0.034,
      },
      glint: {
        waterGlint: 2,
        waterGlintColor: { r: 0.65, g: 0.88, b: 1 },
      },
      specular: {
        waterSpecular: 2.05,
        waterSpecularColor: { r: 0.94, g: 0.98, b: 1 },
      },
    },
  },
  {
    id: "blue-water",
    label: "Blue Water",
    patch: {
      water: {
        waterBrightness: 1.68,
        waterAlpha: 0.76,
        waterRefraction: 0.034,
      },
      tintFinish: {
        waterSaturation: 1.5,
        waterColor: { r: 0.02, g: 0.22, b: 0.78 },
        waterFoam: 2.35,
        waterFoamColorA: { r: 0.03, g: 0.12, b: 0.32 },
        waterFoamColorB: { r: 0.05, g: 0.18, b: 0.42 },
        waterSurfaceBlend: 0.002,
      },
      surface: {
        surfaceWidth: 0.041,
      },
      glint: {
        waterGlint: 2.5,
        waterGlintColor: { r: 0.03, g: 0.12, b: 0.34 },
      },
      specular: {
        waterSpecular: 2.45,
        waterSpecularColor: { r: 0.76, g: 0.9, b: 1 },
      },
    },
  },
];
