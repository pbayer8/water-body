# Segmentation pipeline — future work (phases 4–7)

This document extends the initial prototype (phases 1–3 in code): model load, webcam loop, and CPU canvas compositing with mask / cutout / blur / replace / transparent modes.

## Bundling note (Next.js + `@tensorflow-models/body-segmentation`)

The npm package `@mediapipe/selfie_segmentation` exposes a browser IIFE without ESM named exports, which breaks strict bundlers (especially Turbopack). The TFJS model bundle also **statically imports** that symbol for its MediaPipe runtime path.

This repo therefore:

- Uses **`runtime: "tfjs"`** for `MediaPipeSelfieSegmentation` (loads the TF Hub graph; same family of model weights as the MediaPipe general selfie model).
- Provides a small **`SelfieSegmentation` shim** and resolves `@mediapipe/selfie_segmentation` to it via webpack (and a Turbopack `resolveAlias` if you switch `dev`/`build` back to Turbopack).
- Default scripts use **`next dev --webpack` / `next build --webpack`** so the alias is applied.

If you need the exact **WASM MediaPipe solution** with `solutionPath` CDN assets, plan on loading it outside this pattern (e.g. script tags + global) or migrating to **MediaPipe Image Segmenter** (phase 7) rather than fighting the npm package’s module shape.

## Phase 4 — Quality

Implement in roughly this order so each step builds on the last:

1. **Downsample model input** — Run segmentation on a smaller working width (e.g. 256–512 px) while keeping aspect ratio so inference stays fast on laptops.
2. **Upscale mask to video size** — Draw the low-res mask to a scratch canvas at full `videoWidth` × `videoHeight` with smoothing before compositing (or upsample with a small separable blur to reduce blockiness).
3. **Threshold** — Treat a pixel as foreground when mask probability `> 0.5` (already parameterized in the UI; keep it central for tuning).
4. **Temporal smoothing** — Keep a `Float32Array` (or GPU texture) of the previous mask and each frame set `mask = lerp(prev, current, alpha)` with `alpha` around `0.35` (tune by feel). This noticeably stabilizes edges and shimmer.
5. **Feather edges** — After thresholding or on the continuous mask, apply a small Gaussian or box blur (2–6 px) *on the mask* before using it as an alpha matte for compositing.
6. **Optional morphology** — Cheap erode/dilate passes on the binary or soft mask to trim halos or fill holes; useful when hair and busy backgrounds fight the model.

Expect the largest perceived jump from **temporal smoothing + feathered alpha** rather than swapping models.

## Phase 5 — Performance

- **Decouple render FPS from segmentation FPS** — Aim for ~60 FPS canvas updates while calling `segmentPeople` only every `SEGMENT_INTERVAL_MS` (e.g. 24 FPS → `1000 / 24`). Reuse the last mask between inference ticks.
- **Track `lastSegmentationTime`** with `performance.now()` (or `Date.now()`) and skip `segmentPeople` until the interval elapses; still redraw the canvas every frame using the cached mask and latest video frame where needed.
- **Avoid extra full-frame `getImageData`** once you move matting to WebGL; until then, consider capping output resolution or letterboxing for weaker GPUs.

## Phase 6 — Product architecture

Split responsibilities to match hooks and a thin UI wrapper:

| Piece | Responsibility |
|--------|----------------|
| `useWebcam()` | `getUserMedia`, permission errors, `HTMLVideoElement` ref, play/pause, cleanup (`stop()` tracks). |
| `usePersonSegmentation()` | TFJS backend init, `createSegmenter`, `segmentPeople`, dispose/reset; expose latest `Segmentation[]` or merged mask + timestamps. |
| `useSegmentationRenderer()` | Canvas / WebGL compositor, mode-specific shaders or CPU fallback, resize handling. |
| `SegmentationCanvas` | Composes the three hooks + settings UI or props. |

Suggested settings shape:

```ts
type SegmentationMode = "mask" | "blur" | "replace" | "transparent" | "none";

type SegmentationSettings = {
  mode: SegmentationMode;
  threshold: number;
  featherPx: number;
  smoothing: number;
  targetFps: number;
  modelType: "general" | "landscape";
};
```

Align `SegmentationMode` with product naming (`cutout` vs `blur` etc.) as needed.

## Phase 7 — When to switch to MediaPipe Image Segmenter

Consider migrating off the TFJS `@tensorflow-models/body-segmentation` wrapper when you want:

- Fewer TFJS-specific dependencies in the client bundle.
- Direct use of **MediaPipe Tasks** (`ImageSegmenter`) and tighter alignment with **Google AI Edge** samples.
- Category or confidence masks from Tasks-native outputs.
- A long-term story that is less dependent on TFJS release cadence.

Tradeoff: the **video path is more manual** — create an `ImageSegmenter`, set `runningMode: "VIDEO"`, then feed consecutive frames with `segmentForVideo(...)` and manage timestamps yourself.

Use the current TFJS + selfie segmentation stack until quality and performance targets demand the Tasks API or bundle size forces the move.
