import type { BodySegmenter } from "@tensorflow-models/body-segmentation";

export type SegmentationItem = Awaited<
  ReturnType<BodySegmenter["segmentPeople"]>
>[number];

export type VisualMode =
  | "mask"
  | "cutout"
  | "blur"
  | "replace"
  | "transparent"
  | "none";

export type CpuCompositeScratch = {
  maskCanvas: HTMLCanvasElement;
  mergeCanvas: HTMLCanvasElement;
  videoCanvas: HTMLCanvasElement;
  blurCanvas: HTMLCanvasElement;
  blurSmall: HTMLCanvasElement;
  mergedMask: ImageData | null;
  videoFrame: ImageData | null;
  blurredFrame: ImageData | null;
  backgroundFrame: ImageData | null;
};

/** Call from the browser (e.g. `useEffect`) — not during SSR. */
export function initCpuCompositeScratch(): CpuCompositeScratch {
  return {
    maskCanvas: document.createElement("canvas"),
    mergeCanvas: document.createElement("canvas"),
    videoCanvas: document.createElement("canvas"),
    blurCanvas: document.createElement("canvas"),
    blurSmall: document.createElement("canvas"),
    mergedMask: null,
    videoFrame: null,
    blurredFrame: null,
    backgroundFrame: null,
  };
}

function maskProbability(maskData: ImageData, idx: number): number {
  const r = maskData.data[idx];
  const a = maskData.data[idx + 3];
  if (a !== 255 && a > 0) return a / 255;
  return r / 255;
}

/** Merge all instance masks into a single full-size probability map (RGB same, A=255). */
export async function mergeSegmentationsToMask(
  segmentations: SegmentationItem[],
  width: number,
  height: number,
  scratch: CpuCompositeScratch,
): Promise<ImageData> {
  const { mergeCanvas } = scratch;

  const out = new ImageData(width, height);
  mergeCanvas.width = width;
  mergeCanvas.height = height;
  const mctx = mergeCanvas.getContext("2d", { willReadFrequently: true });
  if (!mctx) throw new Error("2D context unavailable for mask merge");

  for (const seg of segmentations) {
    const src = await seg.mask.toCanvasImageSource();
    mctx.clearRect(0, 0, width, height);
    mctx.drawImage(src, 0, 0, width, height);
    const patch = mctx.getImageData(0, 0, width, height);

    for (let i = 0; i < out.data.length; i += 4) {
      const p = maskProbability(patch, i);
      const prev = out.data[i] / 255;
      const next = Math.max(prev, p);
      const v = Math.round(next * 255);
      out.data[i] = v;
      out.data[i + 1] = v;
      out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
  }

  return out;
}

function drawBlurredBackground(
  video: HTMLVideoElement,
  width: number,
  height: number,
  ctx: CanvasRenderingContext2D,
): void {
  ctx.save();
  ctx.filter = "blur(18px)";
  ctx.drawImage(video, -18, -18, width + 36, height + 36);
  ctx.restore();
}

function drawReplacementBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgb(30 120 200)");
  gradient.addColorStop(1, "rgb(110 180 160)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawThresholdMaskToCanvas(
  maskData: ImageData,
  width: number,
  height: number,
  threshold: number,
  scratch: CpuCompositeScratch,
): HTMLCanvasElement {
  const { maskCanvas } = scratch;
  maskCanvas.width = width;
  maskCanvas.height = height;

  const alphaMask = new ImageData(width, height);
  for (let i = 0; i < alphaMask.data.length; i += 4) {
    const alpha = maskProbability(maskData, i) > threshold ? 255 : 0;
    alphaMask.data[i] = 255;
    alphaMask.data[i + 1] = 255;
    alphaMask.data[i + 2] = 255;
    alphaMask.data[i + 3] = alpha;
  }

  const mctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!mctx) throw new Error("2D context unavailable for threshold mask");
  mctx.putImageData(alphaMask, 0, 0);

  return maskCanvas;
}

function drawPersonLayer(
  video: HTMLVideoElement,
  maskCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  scratch: CpuCompositeScratch,
): HTMLCanvasElement {
  const { videoCanvas } = scratch;
  videoCanvas.width = width;
  videoCanvas.height = height;

  const vctx = videoCanvas.getContext("2d", { willReadFrequently: true });
  if (!vctx) throw new Error("2D context unavailable for person layer");

  vctx.save();
  vctx.clearRect(0, 0, width, height);
  vctx.drawImage(video, 0, 0, width, height);
  vctx.globalCompositeOperation = "destination-in";
  vctx.drawImage(maskCanvas, 0, 0, width, height);
  vctx.restore();

  return videoCanvas;
}

/**
 * Per-pixel CPU compositing: keep foreground where mask > threshold, otherwise use
 * mask preview / solid / blurred / replacement / transparent background.
 */
export async function drawSegmentationComposite(
  video: HTMLVideoElement,
  maskData: ImageData | null,
  outCanvas: HTMLCanvasElement,
  mode: VisualMode,
  threshold: number,
  scratch: CpuCompositeScratch,
): Promise<void> {
  const width = Math.trunc(video.videoWidth);
  const height = Math.trunc(video.videoHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    return;
  }

  if (outCanvas.width !== width) outCanvas.width = width;
  if (outCanvas.height !== height) outCanvas.height = height;
  const octx = outCanvas.getContext("2d", { willReadFrequently: true });
  if (!octx) return;

  if (mode === "none") {
    octx.drawImage(video, 0, 0, width, height);
    return;
  }

  if (!maskData) {
    octx.drawImage(video, 0, 0, width, height);
    return;
  }

  if (mode === "mask") {
    const preview = new ImageData(width, height);
    for (let i = 0; i < preview.data.length; i += 4) {
      const m = maskProbability(maskData, i);
      const v = Math.round(m * 255);
      preview.data[i] = v;
      preview.data[i + 1] = v;
      preview.data[i + 2] = v;
      preview.data[i + 3] = 255;
    }
    octx.putImageData(preview, 0, 0);
    return;
  }

  const alphaMask = drawThresholdMaskToCanvas(
    maskData,
    width,
    height,
    threshold,
    scratch,
  );
  const personLayer = drawPersonLayer(video, alphaMask, width, height, scratch);

  octx.clearRect(0, 0, width, height);

  if (mode === "cutout") {
    octx.fillStyle = "rgb(24 24 27)";
    octx.fillRect(0, 0, width, height);
  } else if (mode === "blur") {
    drawBlurredBackground(video, width, height, octx);
  } else if (mode === "replace") {
    drawReplacementBackground(octx, width, height);
  }

  octx.drawImage(personLayer, 0, 0, width, height);
}
