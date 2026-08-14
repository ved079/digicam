// DigiCam video processing profile — tuned to EXACTLY match the ground-truth
// reference AVI video (IMG_6099.AVI: 320×240, Motion JPEG, 30fps progressive,
// uLaw mono 11025 Hz audio) analyzed frame-by-frame via VLM.
//
// Key findings from the reference analysis that drive these parameters:
//  - Native 320×240 4:3, NO letterboxing, progressive scan (30p) — NOT interlaced
//  - Strong warm/yellow-orange cast (R+10%, G+5%, ~3500K tungsten WB)
//  - LOW saturation (~0.8) — washed/muddy, only LED yellows are vivid
//  - Severe lateral chroma bleed (yellow LED + bright white → 3px horizontal smear)
//  - Gaussian sensor noise σ~3-4, 1px, uniform, luminance + faint chroma (NO banding)
//  - NO interlacing (source is progressive — interlace stage must be OFF)
//  - Hard highlight clip to white, NO streak/flare (no anamorphic bloom)
//  - Light-moderate vignette (~-12% at corners, gradual)
//  - Milky lifted blacks (RGB 15-25), low contrast (~80-120:1), gamma ~1.8-2.0
//  - NO in-camera sharpening (no halos, no edge enhancement)

export interface VideoProfile {
  // ---- Resolution / softness ----
  /** extra blur beyond the photo softness — Gaussian σ~0.9-1.1px per reference */
  softness: number;
  /** native SD resolution cap (long edge). Reference is 320×240 → 320. */
  sensorMaxSize: number;

  // ---- Chroma bloom / bleed ----
  /** lateral chroma bleed on bright/saturated colors (3px horizontal smear) */
  chromaBleed: number;
  /** brightness threshold above which colors bloom */
  bloomThreshold: number;

  // ---- Noise (Gaussian, 1px, uniform) ----
  /** grain amount — moderate-high, uniform across frame */
  grain: number;
  /** grain block scale (1px = single-pixel speckle) */
  grainScale: number;

  // ---- Interlacing / motion artifacts ----
  /** alternating-line horizontal offset (0 = progressive, reference is 30p) */
  interlace: number;
  /** motion amplification of combing (0 since interlace is off) */
  interlaceMotion: number;

  // ---- Highlight blowout ----
  /** threshold above which highlights hard-clip to white (no rolloff) */
  blowoutThreshold: number;
  /** horizontal light-streak intensity (0 = no flare; reference has NONE) */
  streakAmount: number;

  // ---- Vignette (light-moderate, ~-12% at corners) ----
  vignette: number;
  vignetteRadius: number;

  // ---- Low-contrast haze (milky lifted blacks) ----
  /** black-point lift — RGB 15-25 milky floor */
  hazeLift: number;
  /** contrast reduction — low contrast (~80-120:1), gamma ~1.8-2.0 */
  hazeReduce: number;

  // ---- Color cast (warm tungsten ~3500K) ----
  /** warm tint: R+10%, G+5%, B baseline → [1.10, 1.05, 1.0] */
  warmTint: [number, number, number];
  /** saturation multiplier (LOW, ~0.8) */
  saturation: number;

  // ---- Audio (cheap camcorder mic — reference: uLaw mono 11025 Hz) ----
  /** mic low-frequency rolloff (Hz) */
  audioLowFreq: number;
  /** mic high-frequency rolloff (Hz) — 11025 Hz Nyquist → very narrow */
  audioHighFreq: number;
  /** background hiss level (0..1) */
  audioHiss: number;
}

/**
 * The camcorder video profile — EXACT match to the ground-truth reference
 * AVI (IMG_6099.AVI, 320×240 MJPEG 30p, uLaw mono 11025 Hz).
 *
 * Tuned frame-by-frame against 6 extracted reference frames via VLM:
 *  - softness: Gaussian σ~1px, ~200-220 effective lines → 0.6, cap 320
 *  - chromaBleed: 3px horizontal smear on yellows/whites → 0.8
 *  - grain: Gaussian σ~3-4, 1px, uniform, lum+faint chroma → 0.5, scale 1.0
 *  - interlace: OFF (reference is progressive 30p) → 0
 *  - blowoutThreshold: hard clip to white, zero detail → 0.82
 *  - streakAmount: 0 (reference has NO flare/streak, just hard clip)
 *  - hazeLift: RGB 15-25 milky floor → 0.09
 *  - hazeReduce: low contrast ~80-120:1, gamma 1.8-2.0 → 0.22
 *  - vignette: ~-12% at corners, gradual → 0.3 / radius 0.82
 *  - warmTint: [1.10, 1.05, 1.0] (~3500K tungsten)
 *  - saturation: 0.8 (low, washed — only LED yellows vivid)
 *  - audio: 300-5500 Hz, hiss 0.10, mono (uLaw 11025 Hz reference)
 */
export const VIDEO_PROFILE: VideoProfile = {
  softness: 0.6,
  sensorMaxSize: 320,
  chromaBleed: 1.8,
  bloomThreshold: 0.45,
  grain: 0.5,
  grainScale: 1.0,
  interlace: 0, // reference is progressive 30p — NO interlace
  interlaceMotion: 0,
  blowoutThreshold: 0.82,
  streakAmount: 0, // reference has NO streak/flare — hard clip only
  vignette: 0.55,
  vignetteRadius: 0.72,
  hazeLift: 0.09,
  hazeReduce: 0.22,
  warmTint: [1.1, 1.05, 1.0],
  saturation: 0.8,
  audioLowFreq: 300,
  audioHighFreq: 5500,
  audioHiss: 0.1,
};

/**
 * Compute the 4:3 recording canvas dimensions from a source frame, capping
 * the long edge at the profile's sensorMaxSize. Camcorders of this era
 * never shot 16:9 — output is always 4:3 (landscape) or 3:4 (portrait,
 * matching phone orientation).
 */
export function video43Dimensions(
  srcW: number,
  srcH: number,
  profile: VideoProfile = VIDEO_PROFILE,
): { width: number; height: number } {
  const portrait = srcH > srcW;
  const long = Math.min(profile.sensorMaxSize, Math.max(srcW, srcH));
  if (portrait) {
    // 3:4 portrait
    return { width: Math.round(long * 0.75), height: Math.round(long) };
  }
  // 4:3 landscape
  return { width: Math.round(long), height: Math.round(long * 0.75) };
}

/**
 * Compute the UV sub-rect of a source texture that object-cover-crops into a
 * target canvas of dimensions (dstW x dstH), given source dimensions
 * (srcW x srcH). Returns [minX, minY, maxX, maxY] in 0..1 UV space. The
 * shader uses this via uCoverUv to center-crop the source to the canvas
 * aspect without stretching — matching how object-cover behaves in CSS.
 *
 * Note: UV y is in WebGL texture space (0 = bottom). The caller's source
 * dimensions are in natural pixel order; we handle the flip consistency.
 */
export function computeCoverUv(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): [number, number, number, number] {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return [0, 0, 1, 1];
  }
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let minU = 0;
  let maxU = 1;
  let minV = 0;
  let maxV = 1;
  if (srcAspect > dstAspect) {
    // source is wider — crop left/right
    const crop = 1 - dstAspect / srcAspect;
    minU = crop / 2;
    maxU = 1 - crop / 2;
  } else {
    // source is taller — crop top/bottom
    const crop = 1 - srcAspect / dstAspect;
    minV = crop / 2;
    maxV = 1 - crop / 2;
  }
  return [minU, minV, maxU, maxV];
}
