/**
 * The published `@mediapipe/selfie_segmentation` package points `main` at a
 * browser IIFE with no ESM exports, so bundlers (e.g. Turbopack) cannot
 * resolve `import { SelfieSegmentation } from "@mediapipe/selfie_segmentation"`.
 *
 * `@tensorflow-models/body-segmentation` always references that symbol for its
 * MediaPipe runtime path. This repo uses `runtime: "tfjs"` for selfie
 * segmentation, so this stub is never executed — it only satisfies static imports.
 */
export class SelfieSegmentation {
  setOptions(_options: {
    modelSelection?: number;
    selfieMode?: boolean;
  }): void {}

  onResults(
    _callback: (results: { segmentationMask: CanvasImageSource }) => void,
  ): void {}

  send(_input: {
    image: ImageData | HTMLVideoElement | HTMLCanvasElement;
  }): Promise<void> {
    return Promise.resolve();
  }

  close(): void {}

  reset(): void {}

  initialize(): Promise<void> {
    return Promise.resolve();
  }
}
