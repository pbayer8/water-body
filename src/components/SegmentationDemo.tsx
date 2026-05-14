"use client";

import type { BodySegmenter } from "@tensorflow-models/body-segmentation";
import { useEffect, useRef, useState } from "react";
import {
  type CpuCompositeScratch,
  createMaskFrameFromSegmentations,
  initCpuCompositeScratch,
  type MaskFrame,
  type SegmentationItem,
} from "@/lib/segmentation/cpuComposite";
import {
  DEFAULT_WATER_SETTINGS,
  WaterRenderer,
  type WaterSettings,
} from "@/lib/water/waterRenderer";

const SEGMENT_INTERVAL_MS = 1000 / 12;

type SliderConfig = {
  key: keyof WaterSettings;
  label: string;
  min: number;
  max: number;
  step: number;
};

const SLIDERS: { title: string; controls: SliderConfig[] }[] = [
  {
    title: "Resolution",
    controls: [
      { key: "renderScale", label: "Render scale", min: 0.5, max: 2.5, step: 0.1 },
      { key: "simSize", label: "Water grid", min: 128, max: 768, step: 64 },
    ],
  },
  {
    title: "Body Mask",
    controls: [
      { key: "maskThreshold", label: "Mask threshold", min: 0.05, max: 0.95, step: 0.01 },
      { key: "maskFeather", label: "Edge feather", min: 0.001, max: 0.2, step: 0.001 },
      { key: "waterFill", label: "Body fill", min: 0.05, max: 0.95, step: 0.01 },
    ],
  },
  {
    title: "Physics",
    controls: [
      { key: "waveSpeed", label: "Wave speed", min: 0.05, max: 0.9, step: 0.01 },
      { key: "damping", label: "Damping", min: 0.9, max: 0.999, step: 0.001 },
      { key: "restoringForce", label: "Restoring force", min: 0, max: 0.08, step: 0.001 },
      { key: "motionImpulse", label: "Body impulse", min: 0, max: 3, step: 0.05 },
      { key: "edgeImpulse", label: "Edge impulse", min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: "Surface",
    controls: [
      { key: "surfaceSplash", label: "Splashiness", min: 0, max: 4, step: 0.05 },
      { key: "surfaceWidth", label: "Surface width", min: 0.002, max: 0.1, step: 0.001 },
      { key: "surfaceNoise", label: "Surface noise", min: 0, max: 0.05, step: 0.001 },
      { key: "surfaceChop", label: "Surface chop", min: 0, max: 0.18, step: 0.002 },
    ],
  },
  {
    title: "Water",
    controls: [
      { key: "waterBrightness", label: "Brightness", min: 0.2, max: 2, step: 0.02 },
      { key: "waterAlpha", label: "Camera mix", min: 0.1, max: 1, step: 0.01 },
    ],
  },
];

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
  const [settings, setSettings] = useState<WaterSettings>(DEFAULT_WATER_SETTINGS);
  const settingsRef = useRef(settings);
  const [status, setStatus] = useState<string>("Starting…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    scratchRef.current = initCpuCompositeScratch();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      setError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || cancelled) {
          for (const t of stream.getTracks()) {
            t.stop();
          }
          return;
        }
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
  }, []);

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

                  const activeSettings = settingsRef.current;
                  latestMask = people.length
                    ? await createMaskFrameFromSegmentations(
                        people,
                        video.videoWidth,
                        video.videoHeight,
                        scratch,
                        activeSettings.maskThreshold,
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

          renderer.setSettings(settingsRef.current);
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

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        id="output"
        aria-label="Camera view with body-tracked water simulation"
        className="h-screen w-screen bg-black object-contain"
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
        <div className="absolute inset-x-6 top-6 rounded-2xl border border-red-500/40 bg-black/80 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <aside className="absolute right-4 top-4 max-h-[calc(100vh-2rem)] w-80 overflow-y-auto rounded-2xl border border-white/15 bg-black/70 p-4 text-white shadow-2xl backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold tracking-wide">Water tuning</h1>
            <p className="text-xs text-white/60">Live shader controls</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
            onClick={() => setSettings(DEFAULT_WATER_SETTINGS)}
          >
            Reset
          </button>
        </div>

        <div className="space-y-5">
          {SLIDERS.map((group) => (
            <section key={group.title} className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                {group.title}
              </h2>
              {group.controls.map((control) => (
                <label key={control.key} className="block space-y-1.5">
                  <span className="flex items-center justify-between gap-3 text-xs text-white/75">
                    <span>{control.label}</span>
                    <span className="font-mono text-white/50">
                      {settings[control.key].toFixed(control.step < 0.01 ? 3 : 2)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={settings[control.key]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setSettings((current) => ({
                        ...current,
                        [control.key]: value,
                      }));
                    }}
                    className="w-full accent-blue-400"
                  />
                </label>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </main>
  );
}
