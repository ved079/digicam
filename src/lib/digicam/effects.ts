// DigiCam capture pipeline — renders a source frame (video or image)
// through the SAME WebGL shader used for live preview, then re-encodes as
// a low-quality JPEG to bake in authentic 4:2:0 + DCT block artifacts.
// Optionally burns a bottom-right amber digicam date-stamp into the image.
//
// Using the same shader for preview and capture guarantees WYSIWYG: what
// the user sees in the viewfinder is exactly what gets saved.

import type { DigicamPreset } from "./presets";
import { presetToUniforms } from "./presets";
import { GLRenderer } from "./gl-renderer";

export interface ProcessOptions {
  intensity: number; // 0..1
  flashOn?: boolean;
  mirror?: boolean;
  isoBoost?: number;
}

export interface CaptureResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Render a video frame / image through the digicam pipeline into a JPEG
 * blob. Uses a fresh offscreen GLRenderer so capture resolution is
 * independent of the on-screen preview canvas.
 */
export async function captureFrame(
  source: HTMLVideoElement | HTMLImageElement,
  preset: DigicamPreset,
  opts: ProcessOptions,
): Promise<CaptureResult> {
  const srcW =
    "videoWidth" in source
      ? source.videoWidth
      : (source as HTMLImageElement).naturalWidth || source.width;
  const srcH =
    "videoHeight" in source
      ? source.videoHeight
      : (source as HTMLImageElement).naturalHeight || source.height;

  // Cap the long edge to the sensor's max resolution — early digicams were
  // 3-8MP; "Cell" preset caps lower to mimic a VGA-2MP phone sensor.
  const maxSize = preset.sensorMaxSize ?? 1600;
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;

  let renderer: GLRenderer | null = null;
  try {
    renderer = new GLRenderer(offscreen);
    renderer.setSource(source);
    renderer.setUniforms(
      presetToUniforms(preset, opts.intensity, {
        time: performance.now() / 1000,
        isoBoost: opts.isoBoost ?? 0.3,
        flashOn: opts.flashOn ?? false,
        mirror: opts.mirror ?? false,
      }),
    );
    renderer.renderToScreen();

    // Re-encode as JPEG — the browser encoder produces real DCT blockiness
    // + 4:2:0 chroma subsampling, which is exactly the early-digicam
    // compression character we want. Quality follows the preset (Cell is
    // heaviest, PowerShot moderate).
    const blob = await new Promise<Blob>((resolve, reject) => {
      offscreen.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
        "image/jpeg",
        preset.jpegQuality,
      );
    });
    return { blob, width: w, height: h };
  } finally {
    if (renderer) renderer.dispose();
  }
}

/**
 * Burn a digicam-style date-stamp into the bottom-right corner of a JPEG.
 * Small amber (#FFB347) monospace digits with a soft glow + dark backing,
 * matching the real Canon PowerShot "Postcard / date-imprint" mode.
 * The stamp is part of the image (survives export), not a UI overlay.
 */
export function stampTimestamp(blob: Blob, ts: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const d = new Date(ts);
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp =
        `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`;

      // font sized relative to image — small but legible
      const fontSize = Math.max(14, Math.round(canvas.width * 0.024));
      ctx.font = `600 ${fontSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      ctx.textBaseline = "bottom";
      ctx.textAlign = "right";

      const margin = Math.round(canvas.width * 0.028);
      const x = canvas.width - margin;
      const y = canvas.height - margin;
      const tw = ctx.measureText(stamp).width;

      // dark backing strip for legibility against any background
      const padX = fontSize * 0.45;
      const padY = fontSize * 0.35;
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(
        x - tw - padX,
        y - fontSize - padY * 0.4,
        tw + padX * 2,
        fontSize + padY,
      );

      // amber glow (soft) — the signature digicam stamp color
      ctx.save();
      ctx.shadowColor = "rgba(255,160,60,0.85)";
      ctx.shadowBlur = fontSize * 0.55;
      ctx.fillStyle = "#FFB347";
      ctx.fillText(stamp, x, y);
      // second pass for a stronger core
      ctx.shadowBlur = fontSize * 0.2;
      ctx.fillText(stamp, x, y);
      ctx.restore();

      URL.revokeObjectURL(url);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("stamp encode failed"))),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}
