// DigiCam video processing profile — a DISTINCT processing profile from the
// photo filters, modeling period-accurate low-res camcorder / digicam VIDEO
// footage (~2003-2008 SD video). Video compression/artifacts of this era
// were meaningfully worse than still-photo JPEG output, so video uses its
// own heavier parameter set fed into video-specific shader stages.
//
// The video look is layered ON TOP of the chosen photo preset's color
// science (so a "PowerShot video" still reads warm/vivid) but adds:
// heavier softness, chroma bloom/bleed, interlace combing, highlight
// blowout + streaking, low-contrast haze, and constant heavy grain.
//
// See RESEARCH.md and the reference-frame spec for the target aesthetic.

export interface VideoProfile {
  // ---- Resolution / softness (heavier than photo) ----
  /** extra blur beyond the photo softness — simulates low effective res + heavy codec softness */
  softness: number;
  /** SD-video effective resolution cap (long edge). 640 = authentic SD. */
  sensorMaxSize: number;

  // ---- Chroma bloom / bleed ----
  /** amount of chroma bloom on bright saturated colors bleeding into darks (0..1) */
  chromaBleed: number;
  /** brightness threshold above which colors bloom */
  bloomThreshold: number;

  // ---- Noise (heavier + constant, not just low-light) ----
  /** grain amount — heavier than photo, present even in good light */
  grain: number;
  /** grain block scale */
  grainScale: number;

  // ---- Interlacing / motion artifacts ----
  /** alternating-line horizontal offset amount (0..1) */
  interlace: number;
  /** how much motion/edge contrast amplifies the combing (0..1) */
  interlaceMotion: number;

  // ---- Highlight blowout ----
  /** threshold above which highlights clip hard to white (0..1) */
  blowoutThreshold: number;
  /** horizontal light-streak intensity from blown highlights (0..1) */
  streakAmount: number;

  // ---- Vignette (cheap camcorder lens) ----
  vignette: number;
  vignetteRadius: number;

  // ---- Low-contrast haze ----
  /** black-point lift — milky/hazy shadows (0..1) */
  hazeLift: number;
  /** contrast reduction for the hazy look (0..1) */
  hazeReduce: number;

  // ---- Audio (cheap camcorder mic) ----
  /** mic low-frequency rolloff (Hz) */
  audioLowFreq: number;
  /** mic high-frequency rolloff (Hz) */
  audioHighFreq: number;
  /** background hiss level (0..1) */
  audioHiss: number;
}

/**
 * The camcorder video profile — tuned against the ground-truth reference
 * frame (period indoor signage footage) via point-by-point VLM comparison.
 * Also serves as the SHARED BASE for photo capture (via withReferenceBase),
 * so photo + video share the same sensor/lens character.
 *
 * Reference-derived targets:
 *  - softness: ~2-3px AA, chunky pixelation (heavy) → 0.72, SD 640 cap
 *  - chromaBleed: 2-4px spread, hard core + soft halo on saturated colors → 0.7
 *  - grain: moderate-heavy salt-and-pepper, 1-2px, midtones+shadows → 0.62
 *  - interlace: 1px vertical combing teeth on motion/edges → 0.36
 *  - blowoutThreshold: hard clip to pure white, zero detail → 0.76
 *  - streakAmount: horizontal flare ~15-20% of frame width → 0.85
 *  - hazeLift: ~8-12% black lift (blacks read RGB 20-30) → 0.10
 *  - hazeReduce: reduced overall contrast (washed out) → 0.20
 *  - vignette: mild-moderate, starts ~10-15% from edge → 0.32 / radius 0.82
 *  - audio: narrow band 300-4800 Hz, hiss 0.08, mono
 */
export const VIDEO_PROFILE: VideoProfile = {
  softness: 0.82,
  sensorMaxSize: 640,
  chromaBleed: 1.0,
  bloomThreshold: 0.55,
  grain: 0.95,
  grainScale: 1.6,
  interlace: 0.5,
  interlaceMotion: 0.85,
  blowoutThreshold: 0.7,
  streakAmount: 1.6,
  vignette: 0.72,
  vignetteRadius: 0.7,
  hazeLift: 0.14,
  hazeReduce: 0.28,
  audioLowFreq: 300,
  audioHighFreq: 4800,
  audioHiss: 0.08,
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
