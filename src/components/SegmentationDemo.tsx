"use client";

import type { BodySegmenter } from "@tensorflow-models/body-segmentation";
import { useEffect, useRef, useState } from "react";
import {
  type CpuCompositeScratch,
  drawSegmentationComposite,
  initCpuCompositeScratch,
  mergeSegmentationsToMask,
  type SegmentationItem,
  type VisualMode,
} from "@/lib/segmentation/cpuComposite";

const MODES: { id: VisualMode; label: string }[] = [
  { id: "none", label: "Passthrough (no model)" },
  { id: "mask", label: "Mask preview" },
  { id: "cutout", label: "Hard cutout" },
  { id: "blur", label: "Blurred background" },
  { id: "replace", label: "Replace background" },
  { id: "transparent", label: "Transparent (alpha)" },
];

const SEGMENT_INTERVAL_MS = 1000 / 12;

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

  const [mode, setMode] = useState<VisualMode>("blur");
  const [threshold, setThreshold] = useState(0.5);
  const [mirrorSegmentation, setMirrorSegmentation] = useState(false);

  const [status, setStatus] = useState<string>("Starting…");
  const [error, setError] = useState<string | null>(null);

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
    let latestMask: ImageData | null = null;

    const tick = async () => {
      if (!alive) return;
      try {
        if (hasRenderableVideoFrame(video)) {
          const now = performance.now();

          if (
            mode !== "none" &&
            !segmenting &&
            now - lastSegmentationTime >= SEGMENT_INTERVAL_MS
          ) {
            segmenting = true;
            lastSegmentationTime = now;

            segmenter
              .segmentPeople(video, {
                flipHorizontal: mirrorSegmentation,
              })
              .then(async (people) => {
                try {
                  if (!alive) return;

                  latestMask = people.length
                    ? await mergeSegmentationsToMask(
                        people,
                        video.videoWidth,
                        video.videoHeight,
                        scratch,
                      )
                    : null;
                  if (alive) {
                    setStatus((s) => (s === "Ready" ? s : "Ready"));
                  }
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

          await drawSegmentationComposite(
            video,
            mode === "none" ? null : latestMask,
            canvas,
            mode,
            threshold,
            scratch,
          );
        }
      } catch (e) {
        console.error(e);
      }
      raf = requestAnimationFrame(() => void tick());
    };

    tick();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [segmenter, mode, threshold, mirrorSegmentation]);

  const showChecker = mode === "transparent";

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Body segmentation prototype
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Webcam → TensorFlow.js selfie segmentation (TF Hub model) → CPU canvas
          composite (phases 1–3).
        </p>
        <p
          className="text-xs font-medium text-zinc-500 dark:text-zinc-500"
          aria-live="polite"
        >
          {status}
        </p>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Visual mode</span>
          <select
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={mode}
            onChange={(e) => setMode(e.target.value as VisualMode)}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            Person threshold{" "}
            <span className="tabular-nums">({threshold.toFixed(2)})</span>
          </span>
          <input
            type="range"
            min={0.2}
            max={0.85}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-zinc-900 dark:accent-zinc-100"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={mirrorSegmentation}
            onChange={(e) => setMirrorSegmentation(e.target.checked)}
            className="size-4 rounded border-zinc-400"
          />
          Mirror segmentation (maps to front-facing webcam)
        </label>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div
          className={
            showChecker
              ? "rounded-xl p-2 [background-image:linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] [background-position:0_0,0_10px,10px_-10px,-10px_0] [background-size:20px_20px]"
              : "rounded-xl bg-black p-2"
          }
        >
          <canvas
            ref={canvasRef}
            id="output"
            className="max-h-[min(70vh,720px)] w-full max-w-full object-contain"
          />
        </div>

        <video
          ref={videoRef}
          id="video"
          className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
          autoPlay
          muted
          playsInline
        />
      </div>
    </div>
  );
}
