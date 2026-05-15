import type { BodySegmenter } from "@tensorflow-models/body-segmentation";

export type SegmentationItem = Awaited<
  ReturnType<BodySegmenter["segmentPeople"]>
>[number];

export type PersonBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type MaskFrame = {
  imageData: ImageData;
  width: number;
  height: number;
  bounds: PersonBounds;
};

export type CpuCompositeScratch = {
  mergeCanvas: HTMLCanvasElement;
  blurA: Float32Array | null;
  blurB: Float32Array | null;
  blurCum: Float32Array | null;
};

/** Call from the browser (e.g. `useEffect`) — not during SSR. */
export function initCpuCompositeScratch(): CpuCompositeScratch {
  return {
    mergeCanvas: document.createElement("canvas"),
    blurA: null,
    blurB: null,
    blurCum: null,
  };
}

function maskProbability(maskData: ImageData, idx: number): number {
  const r = maskData.data[idx];
  const a = maskData.data[idx + 3];
  if (a !== 255 && a > 0) return a / 255;
  return r / 255;
}

function computePersonBounds(
  maskData: ImageData,
  threshold: number,
): PersonBounds | null {
  let left = maskData.width;
  let right = -1;
  let top = maskData.height;
  let bottom = -1;

  for (let y = 0; y < maskData.height; y++) {
    for (let x = 0; x < maskData.width; x++) {
      const i = (y * maskData.width + x) * 4;
      if (maskProbability(maskData, i) <= threshold) continue;

      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return null;

  return { left, right, top, bottom };
}

function ensureBlurBuffers(
  scratch: CpuCompositeScratch,
  width: number,
  height: number,
): void {
  const n = width * height;
  const cumLen = Math.max(width, height);
  if (!scratch.blurA || scratch.blurA.length < n) {
    scratch.blurA = new Float32Array(n);
    scratch.blurB = new Float32Array(n);
  }
  if (!scratch.blurCum || scratch.blurCum.length < cumLen) {
    scratch.blurCum = new Float32Array(cumLen);
  }
}

/**
 * Separable box blur on the red channel, then hard threshold into a binary mask.
 * Used to stabilize a jittery segmentation outline without relying on alpha feathering.
 */
export function blurThenThresholdMask(
  src: ImageData,
  threshold: number,
  radius: number,
  scratch: CpuCompositeScratch,
): ImageData {
  if (radius < 1) {
    throw new Error("blurThenThresholdMask requires radius >= 1");
  }

  const w = src.width;
  const h = src.height;
  const n = w * h;
  ensureBlurBuffers(scratch, w, h);
  const a = scratch.blurA!;
  const b = scratch.blurB!;
  const cum = scratch.blurCum!;

  const sd = src.data;
  for (let i = 0; i < n; i++) {
    a[i] = sd[i * 4] / 255;
  }

  for (let y = 0; y < h; y++) {
    const row = y * w;
    cum[0] = a[row];
    for (let x = 1; x < w; x++) {
      cum[x] = cum[x - 1] + a[row + x];
    }
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const sum = cum[x1] - (x0 > 0 ? cum[x0 - 1] : 0);
      b[row + x] = sum / (x1 - x0 + 1);
    }
  }

  for (let x = 0; x < w; x++) {
    cum[0] = b[x];
    for (let y = 1; y < h; y++) {
      cum[y] = cum[y - 1] + b[y * w + x];
    }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);
      const sum = cum[y1] - (y0 > 0 ? cum[y0 - 1] : 0);
      a[y * w + x] = sum / (y1 - y0 + 1);
    }
  }

  const out = new ImageData(w, h);
  const od = out.data;
  for (let i = 0; i < n; i++) {
    const on = a[i] >= threshold;
    const v = on ? 255 : 0;
    const j = i * 4;
    od[j] = v;
    od[j + 1] = v;
    od[j + 2] = v;
    od[j + 3] = 255;
  }

  return out;
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

export async function createMaskFrameFromSegmentations(
  segmentations: SegmentationItem[],
  width: number,
  height: number,
  scratch: CpuCompositeScratch,
  threshold = 0.5,
  blurRadius = 0,
): Promise<MaskFrame | null> {
  if (!segmentations.length) return null;

  const merged = await mergeSegmentationsToMask(
    segmentations,
    width,
    height,
    scratch,
  );

  const imageData =
    blurRadius > 0
      ? blurThenThresholdMask(merged, threshold, blurRadius, scratch)
      : merged;

  const boundsThreshold = blurRadius > 0 ? 0.5 : threshold;
  const bounds = computePersonBounds(imageData, boundsThreshold);

  if (!bounds) return null;

  return { imageData, width, height, bounds };
}
