"use client";

import type { BodySegmenter } from "@tensorflow-models/body-segmentation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pane } from "tweakpane";
import {
  type CpuCompositeScratch,
  createMaskFrameFromSegmentations,
  initCpuCompositeScratch,
  type MaskFrame,
  type SegmentationItem,
} from "@/lib/segmentation/cpuComposite";
import {
  assignDemoParams,
  cloneDemoParams,
  DEFAULT_WATER_DEMO_PARAMS,
  demoParamsToWaterSettings,
  mergeDemoParamsWithPreset,
  type WaterDemoParams,
} from "@/lib/water/waterDemoParams";
import { WATER_LOOK_PRESETS } from "@/lib/water/waterPresets";
import { WaterRenderer } from "@/lib/water/waterRenderer";

const IS_LOCAL_DEV =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

const SEGMENT_INTERVAL_MS = 40;

/** Persisted webcam choice for `/` demo (MediaDevices deviceId). */
const CAMERA_DEVICE_ID_STORAGE_KEY = "body-water:segmentation-camera-device-id";

type PaneFolderScopeKey = keyof WaterDemoParams;

type PaneSliderBinding = {
  kind?: "slider";
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
};

type PaneColorBinding = {
  kind: "color";
  key: string;
  label: string;
};

type PaneBinding = PaneSliderBinding | PaneColorBinding;

type PaneFolderDef = {
  title: string;
  scopeKey: PaneFolderScopeKey;
  controls: readonly PaneBinding[];
};

/** Folder titles + bindings against {@link WaterDemoParams}[scopeKey]. */
const PARAM_FOLDERS = [
  {
    title: "Resolution",
    scopeKey: "resolution",
    controls: [
      {
        key: "renderScale",
        label: "Render scale",
        min: 0.5,
        max: 2.5,
        step: 0.1,
      },
      { key: "simSize", label: "Water grid", min: 128, max: 768, step: 64 },
    ],
  },
  {
    title: "Body Mask",
    scopeKey: "bodyMask",
    controls: [
      {
        key: "maskThreshold",
        label: "Mask threshold",
        min: 0.05,
        max: 0.95,
        step: 0.01,
      },
      {
        key: "maskFeather",
        label: "Edge feather",
        min: 0.001,
        max: 0.2,
        step: 0.001,
      },
      {
        key: "maskTemporalHalfLifeMs",
        label: "Mask ease (ms)",
        min: 0,
        max: 400,
        step: 10,
      },
      {
        key: "maskBlurRadius",
        label: "Blur→threshold (px)",
        min: 0,
        max: 16,
        step: 1,
      },
      {
        key: "waterFill",
        label: "Body fill",
        min: 0.05,
        max: 0.95,
        step: 0.01,
      },
    ],
  },
  {
    title: "Physics",
    scopeKey: "physics",
    controls: [
      {
        key: "waveSpeed",
        label: "Wave speed",
        min: 0.05,
        max: 0.9,
        step: 0.01,
      },
      { key: "damping", label: "Damping", min: 0.9, max: 0.999, step: 0.001 },
      {
        key: "restoringForce",
        label: "Restoring force",
        min: 0,
        max: 0.08,
        step: 0.001,
      },
      {
        key: "motionImpulse",
        label: "Body impulse",
        min: 0,
        max: 3,
        step: 0.05,
      },
      // Edge impulse (simulation uses body impulse only — see waterRenderer SIMULATION_SHADER)
      // { key: "edgeImpulse", label: "Edge impulse", min: 0, max: 2, step: 0.05 },
      // {
      //   key: "edgeRippleSpatialScale",
      //   label: "Edge ripple scale",
      //   min: 0.0,
      //   max: 40,
      //   step: 0.05,
      // },
      // {
      //   key: "edgeRippleTimeScale",
      //   label: "Edge ripple speed",
      //   min: 0,
      //   max: 5,
      //   step: 0.05,
      // },
      // {
      //   key: "maskEdgeGain",
      //   label: "Mask edge gain",
      //   min: 0,
      //   max: 12,
      //   step: 0.1,
      // },
    ],
  },
  {
    title: "Surface",
    scopeKey: "surface",
    controls: [
      {
        key: "surfaceSplash",
        label: "Splashiness",
        min: 0,
        max: 4,
        step: 0.05,
      },
      {
        key: "surfaceWidth",
        label: "Surface width",
        min: 0.002,
        max: 0.1,
        step: 0.001,
      },
      {
        key: "surfaceNoiseAmplitude",
        label: "Noise amplitude",
        min: 0,
        max: 0.05,
        step: 0.001,
      },
      {
        key: "surfaceNoiseFrequency",
        label: "Noise frequency",
        min: 0,
        max: 6,
        step: 0.05,
      },
      {
        key: "surfaceChopAmplitude",
        label: "Chop amplitude",
        min: 0,
        max: 0.18,
        step: 0.002,
      },
      {
        key: "surfaceChopFrequency",
        label: "Chop frequency",
        min: 0,
        max: 12,
        step: 0.1,
      },
    ],
  },
  {
    title: "Water",
    scopeKey: "water",
    controls: [
      {
        key: "waterBrightness",
        label: "Brightness",
        min: 0.2,
        max: 2,
        step: 0.02,
      },
      { key: "waterAlpha", label: "Camera mix", min: 0.1, max: 1, step: 0.01 },
      {
        key: "waterRefraction",
        label: "Refraction",
        min: 0,
        max: 0.1,
        step: 0.002,
      },
    ],
  },
  {
    title: "Glint (Fresnel tint)",
    scopeKey: "glint",
    controls: [
      { kind: "color", key: "waterGlintColor", label: "Glint tint" },
      {
        key: "waterGlint",
        label: "Glint amount",
        min: 0,
        max: 2.5,
        step: 0.05,
      },
      {
        key: "waterGlintNormalMin",
        label: "Glint grad start",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: "waterGlintNormalMax",
        label: "Glint grad end",
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    title: "Specular highlight",
    scopeKey: "specular",
    controls: [
      { kind: "color", key: "waterSpecularColor", label: "Specular tint" },
      {
        key: "waterSpecular",
        label: "Specular amount",
        min: 0,
        max: 2.5,
        step: 0.05,
      },
      {
        key: "waterSpecularShininess",
        label: "Sharpness (exponent)",
        min: 4,
        max: 200,
        step: 1,
      },
      {
        key: "waterSpecularSheenWeight",
        label: "Sheen weight",
        min: 0,
        max: 2,
        step: 0.02,
      },
      {
        key: "waterSpecularSheenPower",
        label: "Sheen spread",
        min: 2,
        max: 64,
        step: 0.5,
      },
      {
        key: "waterSpecularCouplingFlat",
        label: "Spec × glint base",
        min: 0,
        max: 2.5,
        step: 0.02,
      },
      {
        key: "waterSpecularCouplingGlint",
        label: "Spec × glint boost",
        min: 0,
        max: 2.5,
        step: 0.02,
      },
      {
        key: "waterSpecularLightX",
        label: "Light dir X",
        min: -3,
        max: 3,
        step: 0.02,
      },
      {
        key: "waterSpecularLightY",
        label: "Light dir Y",
        min: -3,
        max: 3,
        step: 0.02,
      },
      {
        key: "waterSpecularLightZ",
        label: "Light dir Z",
        min: -3,
        max: 3,
        step: 0.02,
      },
      {
        key: "waterSpecularNormalScale",
        label: "Highlight normal scale",
        min: 0.25,
        max: 12,
        step: 0.05,
      },
    ],
  },
  {
    title: "Tint & finish",
    scopeKey: "tintFinish",
    controls: [
      { kind: "color", key: "waterColor", label: "Body tint" },
      {
        key: "waterFoam",
        label: "Foam / splash",
        min: 0,
        max: 2.5,
        step: 0.05,
      },
      { kind: "color", key: "waterFoamColorA", label: "Foam (waterline)" },
      { kind: "color", key: "waterFoamColorB", label: "Foam (splash)" },
      {
        key: "waterSaturation",
        label: "Saturation",
        min: 0,
        max: 2,
        step: 0.02,
      },
      {
        key: "waterSurfaceBlend",
        label: "Surface softness",
        min: 0.002,
        max: 0.08,
        step: 0.001,
      },
    ],
  },
] satisfies readonly PaneFolderDef[];

function hasRenderableVideoFrame(video: HTMLVideoElement): boolean {
  const width = Math.trunc(video.videoWidth);
  const height = Math.trunc(video.videoHeight);

  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    return false;
  }

  // The TFJS selfie segmentation path reads `video.width` / `video.height`,
  // which are 0 unless the element attrs are explicitly synced to the stream.
  if (video.width !== width) video.width = width;
  if (video.height !== height) video.height = height;

  return true;
}

async function disposeSegmentations(
  segmentations: SegmentationItem[] | null,
): Promise<void> {
  if (!segmentations) return;

  await Promise.all(
    segmentations.map(async (segmentation) => {
      if (segmentation.mask.getUnderlyingType() !== "tensor") return;

      try {
        const tensor = await segmentation.mask.toTensor();
        tensor.dispose();
      } catch {
        // Best-effort cleanup; rendering should not fail because disposal did.
      }
    }),
  );
}

export function SegmentationDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<CpuCompositeScratch | null>(null);

  const [segmenter, setSegmenter] = useState<BodySegmenter | null>(null);
  const [demoParams, setDemoParams] = useState<WaterDemoParams>(() =>
    cloneDemoParams(DEFAULT_WATER_DEMO_PARAMS),
  );
  const demoParamsRef = useRef(demoParams);
  const rendererSettingsRef = useRef(
    demoParamsToWaterSettings(DEFAULT_WATER_DEMO_PARAMS),
  );
  const tweakpaneParamsRef = useRef<WaterDemoParams>(
    cloneDemoParams(DEFAULT_WATER_DEMO_PARAMS),
  );
  const tweakpanePaneRef = useRef<Pane | null>(null);
  const [status, setStatus] = useState<string>("Starting…");
  const [error, setError] = useState<string | null>(null);
  const [activeLookPresetId, setActiveLookPresetId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    demoParamsRef.current = demoParams;
    rendererSettingsRef.current = demoParamsToWaterSettings(demoParams);
  }, [demoParams]);

  useEffect(() => {
    if (!IS_LOCAL_DEV) return;
    assignDemoParams(tweakpaneParamsRef.current, demoParams);
    tweakpanePaneRef.current?.refresh();
  }, [demoParams]);

  useEffect(() => {
    if (!IS_LOCAL_DEV) return;

    assignDemoParams(tweakpaneParamsRef.current, demoParamsRef.current);

    let cancelled = false;
    void import("tweakpane").then(({ Pane: Tweakpane }) => {
      if (cancelled) return;

      const pane = new Tweakpane({
        title: "Water tuning",
        expanded: true,
      });
      tweakpanePaneRef.current = pane;

      const paneEl = pane.element;
      paneEl.style.position = "fixed";
      paneEl.style.top = "1rem";
      paneEl.style.right = "1rem";
      paneEl.style.maxHeight = "calc(100vh - 2rem)";
      paneEl.style.overflowY = "auto";
      paneEl.style.zIndex = "40";

      for (const group of PARAM_FOLDERS) {
        const folder = pane.addFolder({
          title: group.title,
          expanded: true,
        });
        const scope = tweakpaneParamsRef.current[group.scopeKey] as Record<
          string,
          unknown
        >;
        for (const c of group.controls) {
          if ("kind" in c && c.kind === "color") {
            folder.addBinding(scope, c.key, {
              label: c.label,
              view: "color",
              color: { type: "float" },
            });
          } else {
            folder.addBinding(scope, c.key, {
              label: c.label,
              min: c.min,
              max: c.max,
              step: c.step,
            });
          }
        }
      }

      pane.addButton({ title: "Reset" }).on("click", () => {
        setActiveLookPresetId(null);
        assignDemoParams(tweakpaneParamsRef.current, DEFAULT_WATER_DEMO_PARAMS);
        pane.refresh();
        setDemoParams(cloneDemoParams(DEFAULT_WATER_DEMO_PARAMS));
      });

      pane.on("change", () => {
        setActiveLookPresetId(null);
        setDemoParams(cloneDemoParams(tweakpaneParamsRef.current));
      });
    });

    return () => {
      cancelled = true;
      tweakpanePaneRef.current?.dispose();
      tweakpanePaneRef.current = null;
    };
  }, []);

  useEffect(() => {
    scratchRef.current = initCpuCompositeScratch();
  }, []);

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [cameraPrefsHydrated, setCameraPrefsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CAMERA_DEVICE_ID_STORAGE_KEY);
      if (stored) setSelectedDeviceId(stored);
    } catch {
      // ignore private mode / blocked storage
    }
    setCameraPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!cameraPrefsHydrated) return;
    try {
      if (selectedDeviceId) {
        localStorage.setItem(CAMERA_DEVICE_ID_STORAGE_KEY, selectedDeviceId);
      } else {
        localStorage.removeItem(CAMERA_DEVICE_ID_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [cameraPrefsHydrated, selectedDeviceId]);

  const refreshCameraList = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameraDevices(all.filter((d) => d.kind === "videoinput"));
    } catch {
      // Non-fatal: picker stays empty until a later refresh.
    }
  }, []);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.addEventListener
    ) {
      return;
    }

    navigator.mediaDevices.addEventListener("devicechange", refreshCameraList);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        refreshCameraList,
      );
    };
  }, [refreshCameraList]);

  useEffect(() => {
    if (!cameraPrefsHydrated) return;

    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      setError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { facingMode: "user" },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || cancelled) {
          for (const t of stream.getTracks()) {
            t.stop();
          }
          return;
        }
        const trackSettings = stream.getVideoTracks()[0]?.getSettings();
        if (trackSettings?.deviceId && selectedDeviceId == null && !cancelled) {
          setSelectedDeviceId(trackSettings.deviceId);
        }
        void refreshCameraList();
        video.srcObject = stream;
        await video.play();
        if (!cancelled)
          setStatus((s) =>
            s.includes("model") ? s : "Camera ready · loading model…",
          );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open webcam");
          setStatus("Camera error");
        }
      }
    })();

    return () => {
      cancelled = true;
      const tracks = stream?.getTracks() ?? [];
      for (const t of tracks) {
        t.stop();
      }
    };
  }, [cameraPrefsHydrated, refreshCameraList, selectedDeviceId]);

  useEffect(() => {
    let cancelled = false;
    let instance: BodySegmenter | null = null;

    (async () => {
      try {
        await import("@tensorflow/tfjs-backend-webgl");
        const tf = await import("@tensorflow/tfjs-core");
        await tf.setBackend("webgl");
        await tf.ready();
        const bodySegmentation = await import(
          "@tensorflow-models/body-segmentation"
        );
        if (cancelled) return;

        setStatus("Loading selfie segmentation (TFJS runtime)…");
        const created = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          {
            runtime: "tfjs",
            modelType: "general",
          },
        );
        if (cancelled) {
          created.dispose();
          return;
        }
        instance = created;
        setSegmenter(created);
        setStatus("Ready");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Model failed to load");
          setStatus("Model error");
        }
      }
    })();

    return () => {
      cancelled = true;
      instance?.dispose();
      setSegmenter(null);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const scratch = scratchRef.current;

    if (!video || !canvas || !scratch || !segmenter) return;

    let alive = true;
    let raf = 0;
    let lastSegmentationTime = 0;
    let segmenting = false;
    let latestMask: MaskFrame | null = null;
    let renderer: WaterRenderer;

    try {
      renderer = new WaterRenderer(canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not initialize WebGL2.");
      return;
    }

    const tick = (now: number) => {
      if (!alive) return;
      try {
        if (hasRenderableVideoFrame(video)) {
          if (
            !segmenting &&
            now - lastSegmentationTime >= SEGMENT_INTERVAL_MS
          ) {
            segmenting = true;
            lastSegmentationTime = now;

            segmenter
              .segmentPeople(video, {
                flipHorizontal: false,
              })
              .then(async (people) => {
                try {
                  if (!alive) return;

                  const activeSettings = rendererSettingsRef.current;
                  latestMask = people.length
                    ? await createMaskFrameFromSegmentations(
                        people,
                        video.videoWidth,
                        video.videoHeight,
                        scratch,
                        activeSettings.maskThreshold,
                        activeSettings.maskBlurRadius,
                      )
                    : null;
                  if (alive) {
                    setStatus((s) => (s === "Ready" ? s : "Ready"));
                  }
                  renderer.setMaskFrame(latestMask);
                } finally {
                  void disposeSegmentations(people);
                }
              })
              .catch((e) => {
                console.error(e);
              })
              .finally(() => {
                segmenting = false;
              });
          }

          renderer.setSettings(rendererSettingsRef.current);
          renderer.render(video, now);
        }
      } catch (e) {
        console.error(e);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, [segmenter]);

  const orphanedSelection =
    selectedDeviceId !== null &&
    cameraDevices.every((d) => d.deviceId !== selectedDeviceId);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        id="output"
        aria-label="Camera view with body-tracked water simulation"
        className="h-screen w-screen bg-transparent object-contain"
      />

      <video
        ref={videoRef}
        id="video"
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        autoPlay
        muted
        playsInline
      />

      <p className="sr-only" aria-live="polite">
        {status}
      </p>

      {error ? (
        <div className="absolute inset-x-6 top-24 z-[45] rounded-2xl border border-red-500/40 bg-black/80 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 top-4 z-[50] px-3">
        <div className="mx-auto grid w-full max-w-[100vw] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
          <div className="pointer-events-auto min-w-0 justify-self-start">
            <label htmlFor="camera-device" className="sr-only">
              Camera
            </label>
            <select
              id="camera-device"
              aria-label="Choose camera"
              className="max-w-[min(15rem,38vw)] w-full min-w-0 cursor-pointer appearance-none rounded-full border border-white/20 bg-black/35 py-1.5 pl-3.5 pr-7 text-xs font-medium text-white/90 shadow-sm backdrop-blur-md outline-none transition hover:border-white/40 hover:bg-black/45 focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[16rem]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(255,255,255,0.75)' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.5rem center",
                backgroundSize: "0.75rem",
              }}
              disabled={cameraDevices.length === 0}
              value={
                cameraDevices.length === 0
                  ? ""
                  : orphanedSelection && selectedDeviceId
                    ? selectedDeviceId
                    : (selectedDeviceId ?? "")
              }
              onChange={(event) =>
                setSelectedDeviceId(event.target.value || null)
              }
            >
              {cameraDevices.length === 0 ? (
                <option value="">Detecting cameras…</option>
              ) : (
                <>
                  {orphanedSelection ? (
                    <option value={selectedDeviceId}>Current camera</option>
                  ) : null}
                  {cameraDevices.map((device, index) => {
                    const fallback = `Camera ${index + 1}`;
                    const label =
                      device.label && device.label.trim().length > 0
                        ? device.label.trim()
                        : fallback;
                    return (
                      <option key={device.deviceId} value={device.deviceId}>
                        {label}
                      </option>
                    );
                  })}
                </>
              )}
            </select>
          </div>

          <div
            role="toolbar"
            aria-label="Water look presets"
            className="pointer-events-none col-start-2 row-start-1 flex max-w-[min(100vw-10rem,56rem)] flex-wrap justify-center gap-2 justify-self-center"
          >
            {WATER_LOOK_PRESETS.map((preset) => {
              const selected = preset.id === activeLookPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    selected
                      ? "pointer-events-auto rounded-full border border-white/55 bg-white/25 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-md transition hover:bg-white/35"
                      : "pointer-events-auto rounded-full border border-white/20 bg-black/35 px-3.5 py-1.5 text-xs font-medium text-white/90 shadow-sm backdrop-blur-md transition hover:border-white/40 hover:bg-black/45"
                  }
                  onClick={() => {
                    setActiveLookPresetId(preset.id);
                    setDemoParams((prev) =>
                      mergeDemoParamsWithPreset(prev, preset.patch),
                    );
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
