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
};

/** Call from the browser (e.g. `useEffect`) — not during SSR. */
export function initCpuCompositeScratch(): CpuCompositeScratch {
  return {
    mergeCanvas: document.createElement("canvas"),
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
): Promise<MaskFrame | null> {
  if (!segmentations.length) return null;

  const imageData = await mergeSegmentationsToMask(
    segmentations,
    width,
    height,
    scratch,
  );
  const bounds = computePersonBounds(imageData, threshold);

  if (!bounds) return null;

  return { imageData, width, height, bounds };
}
