// Canvas-based digicam image processing pipeline.
// Takes a source video frame (or image) and bakes in the preset look:
// tint, contrast/saturation, black-lift fade, grain, vignette, and a
// final JPEG compression pass for that authentic early-2000s artifact feel.

import type { DigicamPreset } from "./presets";

export interface ProcessOptions {
  intensity: number; // 0..1 — how strong the emulation is
  /** output max dimension; image is downscaled to mimic low-res sensors */
  maxSize?: number;
  /** JPEG quality 0..1 */
  quality?: number;
}

/**
 * Render a video frame through the digicam pipeline into a JPEG blob.
 * Returns { blob, width, height }.
 */
export async function captureFrame(
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap,
  preset: DigicamPreset,
  opts: ProcessOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const srcW =
    "videoWidth" in source
      ? source.videoWidth
      : (source as HTMLImageElement).naturalWidth || source.width;
  const srcH =
    "videoHeight" in source
      ? source.videoHeight
      : (source as HTMLImageElement).naturalHeight || source.height;

  const maxSize = opts.maxSize ?? 1600;
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  // Mimic a 3-4MP early-2000s sensor by capping the long edge.
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  // Draw source onto a working canvas.
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d", { willReadFrequently: true })!;
  wctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

  const img = wctx.getImageData(0, 0, w, h);
  const data = img.data;

  const intensity = clamp(opts.intensity, 0, 1);
  // Blend factor: at intensity 0 we leave pixels nearly untouched.
  const k = intensity;

  const [tr, tg, tb] = preset.tint;
  const contrastF = 1 + (preset.contrast - 0.5) * 2 * k; // map 0.5 -> 1
  const bright = 1 + (preset.brightness - 1) * k;
  const sat = 1 + (preset.saturation - 1) * k;
  const lift = preset.blackLift * k * 255;
  const temp = preset.tempShift * k;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Tint (channel multiply), blended by k
    r = r * (1 + (tr - 1) * k);
    g = g * (1 + (tg - 1) * k);
    b = b * (1 + (tb - 1) * k);

    // Temp shift — warm pushes red up / blue down, cool the reverse.
    r = r + temp * 18;
    b = b - temp * 18;

    // Saturation around luminance.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    // Brightness
    r *= bright;
    g *= bright;
    b *= bright;

    // Contrast around 128
    r = (r - 128) * contrastF + 128;
    g = (g - 128) * contrastF + 128;
    b = (b - 128) * contrastF + 128;

    // Black lift — raise the floor for a faded look
    r = r + lift * (1 - r / 255);
    g = g + lift * (1 - g / 255);
    b = b + lift * (1 - b / 255);

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }

  wctx.putImageData(img, 0, 0);

  // Vignette
  if (preset.vignette > 0 && k > 0.01) {
    applyVignette(wctx, w, h, preset.vignette * k, preset.vignetteRadius);
  }

  // Grain
  if (preset.grain > 0 && k > 0.01) {
    applyGrain(wctx, w, h, preset.grain * k, preset.grainScale);
  }

  // JPEG compression pass — first encode, then re-decode so artifacts are baked
  // into pixel data (authentic digicam blocky compression character).
  const quality = opts.quality ?? 0.74;
  const blob = await new Promise<Blob>((resolve, reject) => {
    work.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality,
    );
  });

  return { blob, width: w, height: h };
}

function applyVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
  radius: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const inner = Math.min(w, h) * radius * 0.5;
  const outer = Math.sqrt(cx * cx + cy * cy);
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = grad;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillRect(0, 0, w, h);
}

function applyGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
  scale: number,
) {
  const gw = Math.ceil(w / scale);
  const gh = Math.ceil(h / scale);
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = gw;
  grainCanvas.height = gh;
  const gctx = grainCanvas.getContext("2d")!;
  const noise = gctx.createImageData(gw, gh);
  const nd = noise.data;
  for (let i = 0; i < nd.length; i += 4) {
    // monochrome noise, slightly luminance-skewed
    const v = (Math.random() * 255) | 0;
    nd[i] = v;
    nd[i + 1] = v;
    nd[i + 2] = v;
    nd[i + 3] = 255;
  }
  gctx.putImageData(noise, 0, 0);

  ctx.save();
  ctx.globalAlpha = strength * 0.22;
  ctx.globalCompositeOperation = "overlay";
  // scale up with nearest-neighbor for blocky CCD noise
  ctx.imageSmoothingEnabled = scale <= 1;
  ctx.drawImage(grainCanvas, 0, 0, gw, gh, 0, 0, w, h);
  ctx.restore();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function clampByte(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Draw a timestamp readout (monospace) into the corner of a photo —
 * the singular authentic digicam data detail. Drawn onto the capture
 * so it survives export.
 */
export function stampTimestamp(
  blob: Blob,
  ts: number,
): Promise<Blob> {
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
      const pad2 = (n: number) => String(n).padStart(2, "0");
      void pad2;

      const fontSize = Math.max(14, Math.round(canvas.width * 0.022));
      ctx.font = `${fontSize}px var(--font-geist-mono), ui-monospace, monospace`.replace(
        "var(--font-geist-mono)",
        "monospace",
      );
      ctx.textBaseline = "bottom";
      const margin = Math.round(canvas.width * 0.025);
      const x = margin;
      const y = canvas.height - margin;

      // subtle dark backdrop for legibility
      const tw = ctx.measureText(stamp).width;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(
        x - fontSize * 0.25,
        y - fontSize * 1.05,
        tw + fontSize * 0.5,
        fontSize * 1.3,
      );
      // amber digicam-orange text, classic
      ctx.fillStyle = "#FFB347";
      ctx.fillText(stamp, x, y);

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
