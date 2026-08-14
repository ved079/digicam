// DigiCam camera-style presets — researched color-science profiles based
// on real early-2000s digicam sensors (see RESEARCH.md). Each preset is a
// distinct parameter set that feeds the SAME WebGL pipeline
// (shaders.ts / gl-renderer.ts). The intensity slider scales the whole
// look; presetToUniforms() blends from identity (intensity 0) to the
// full camera signature (intensity 1).

import type { VideoProfile } from "./video-profile";

export type PresetId = "powershot" | "cybershot" | "exilim" | "cell";

export interface DigicamPreset {
  id: PresetId;
  label: string;
  /** swatch color used in the style switcher thumbnail */
  swatch: string;
  /** one-line mood descriptor shown under the label when selected */
  tagline: string;
  /** which real camera this is modeled on (for the info readout) */
  model: string;

  // ---- Color science (researched, see RESEARCH.md §2) ----
  /** RGB channel multipliers — the brand's white-balance/tint signature */
  tint: [number, number, number];
  /** white-balance temperature bias, -1 (cool) .. +1 (warm) */
  warmth: number;
  /** saturation multiplier (1 = unchanged) */
  saturation: number;
  /** contrast multiplier (1 = unchanged) */
  contrast: number;
  /** brightness multiplier (1 = unchanged) */
  brightness: number;
  /** shadow toe crush 0..1 — how hard shadows are crushed (limited DR) */
  shadowCrush: number;
  /** highlight clip threshold 0..1 — how hard highlights blow */
  highlightClip: number;

  // ---- CCD noise (see RESEARCH.md §1) ----
  /** grain amount 0..1 */
  grain: number;
  /** fixed-pattern-noise / grain block scale (px) — CCD blockiness */
  grainScale: number;
  /** chroma noise in shadows 0..1 */
  chromaNoise: number;

  // ---- Optics / demosaic (§4) ----
  /** chromatic aberration amount (UV offset) */
  aberration: number;
  /** AA-filter + demosaic softness 0..1 */
  softness: number;
  /** in-camera sharpening 0..1 (Sony high, Casio low) */
  sharpen: number;

  // ---- JPEG compression (§3) ----
  /** shader-side blockiness approximation 0..1 */
  blockiness: number;
  /** capture-time JPEG quality 0..1 (real DCT + 4:2:0 re-encode) */
  jpegQuality: number;

  // ---- Vignette (lens character) ----
  vignette: number;
  vignetteRadius: number;

  // ---- Flash (§6) — applied when flash toggle is on ----
  /** RGB multiplier for the flash tint (flash ~5500-6000K, often cool) */
  flashTint: [number, number, number];

  // ---- Sensor resolution target (§"low native resolution") ----
  /** max capture dimension — most digicams were 3-8MP; "Cell" is lower */
  sensorMaxSize: number;
}

export const PRESETS: DigicamPreset[] = [
  {
    id: "powershot",
    label: "PowerShot",
    swatch: "#E8B57A",
    tagline: "Canon · warm · vivid",
    model: "Canon PowerShot A620",
    // Canon PowerShot A620/A640 (2006-2007) color science, refined per
    // Task A gap analysis vs real reference photos:
    //  - warmth reduced 0.4→0.28 (real Canon WB is warm-biased but the indoor
    //    output read as excessively orange/syrupy vs Canon's gentler gold).
    //  - tint R pulled back 1.045→1.032 (greens were shifting olive).
    //  - sharpen 0.26→0.16 (A640 was 'reasonably sharp, NOT oversharpened';
    //    the halo on hair/straps was too modern/digital).
    //  - highlightClip 0.1→0.06 (Canon famous for creamy highlight rolloff,
    //    not hard clipping; sky was transitioning too abruptly).
    //  - shadowCrush 0.14→0.09 (shadows under chin/hair too muddy; Canon
    //    retained better shadow detail / lifted toe).
    //  - grain 0.34→0.40 + chromaNoise 0.16→0.12 (indoor scene was too
    //    clean/plastic for ISO 80-100 CCD; real Canon shows fine luminance
    //    grain but LOW chroma noise — luminance up, chroma down).
    //  - flashTint nudged warmer (1.0,0.985,0.955)→(1.0,0.99,0.962) so the
    //    flash scene's background isn't clipped to pure sensor-floor black.
    tint: [1.032, 1.0, 0.935],
    warmth: 0.28,
    saturation: 1.12,
    contrast: 1.08,
    brightness: 1.0,
    shadowCrush: 0.09,
    highlightClip: 0.06,
    grain: 0.4,
    grainScale: 1.5,
    chromaNoise: 0.12,
    aberration: 0.0016,
    softness: 0.34,
    sharpen: 0.16,
    blockiness: 0.2,
    jpegQuality: 0.74,
    vignette: 0.24,
    vignetteRadius: 0.85,
    flashTint: [1.0, 0.99, 0.962],
    sensorMaxSize: 1600,
  },
  {
    id: "cybershot",
    label: "Cyber-shot",
    swatch: "#A9C2D6",
    tagline: "Sony · cool · punchy",
    model: "Sony Cyber-shot DSC-W55",
    // Sony: cooler, very vivid blues, high contrast, crushed shadows,
    // aggressive sharpening, more shadow chroma noise
    tint: [0.955, 1.0, 1.055],
    warmth: -0.32,
    saturation: 1.2,
    contrast: 1.18,
    brightness: 1.0,
    shadowCrush: 0.26,
    highlightClip: 0.2,
    grain: 0.46,
    grainScale: 1.1,
    chromaNoise: 0.38,
    aberration: 0.001,
    softness: 0.2,
    sharpen: 0.46,
    blockiness: 0.16,
    jpegQuality: 0.72,
    vignette: 0.2,
    vignetteRadius: 0.9,
    flashTint: [0.98, 1.0, 1.05],
    sensorMaxSize: 1600,
  },
  {
    id: "exilim",
    label: "Exilim",
    swatch: "#F2D4C7",
    tagline: "Casio · soft · pastel",
    model: "Casio Exilim EX-Z75",
    // Casio Exilim EX-Z75 (2007) color science, refined per Task A gap
    // analysis vs real reference photos. Real Exilim: 'soft and a little
    // noisy even at ISO 100', mediocre DR, weak/soft lens, muted color.
    //  - saturation 0.84→0.76 (real Exilim is slightly UNDER-saturated/
    //    muted; daylight output was too rich/modern).
    //  - shadowCrush 0.1→0.18 (mediocre DR — real camera crushes shadows
    //    harder than baseline; output retained too much shadow detail).
    //  - highlightClip 0.06→0.12 (mediocre DR also blows highlights;
    //    window in flash scene should be near-featureless, not detailed).
    //  - grain 0.3→0.46 + chromaNoise 0.2→0.34 (output was too clean for
    //    a 2007 CCD at ISO 100; real Exilim has visible luminance + color
    //    noise, especially in shadows).
    //  - softness 0.56→0.66 + vignette 0.14→0.22 / radius 0.95→0.86 (real
    //    Exilim lens is a 'weak component' — significant corner softness +
    //    falloff; corners were too sharp in output).
    //  - NOTE: barrel distortion (real Exilim trait at wide angle) is NOT
    //    simulated — would require a UV-warp shader stage not in the current
    //    single-pass pipeline. Flagged in RESEARCH.md as a follow-up.
    tint: [1.025, 1.0, 1.0],
    warmth: 0.12,
    saturation: 0.76,
    contrast: 0.92,
    brightness: 1.05,
    shadowCrush: 0.18,
    highlightClip: 0.12,
    grain: 0.46,
    grainScale: 2.0,
    chromaNoise: 0.34,
    aberration: 0.0022,
    softness: 0.66,
    sharpen: 0.1,
    blockiness: 0.26,
    jpegQuality: 0.68,
    vignette: 0.22,
    vignetteRadius: 0.86,
    flashTint: [1.025, 1.0, 0.98],
    sensorMaxSize: 1400,
  },
  {
    id: "cell",
    label: "Cell",
    swatch: "#B8C2A8",
    tagline: "Cam-phone · green · noisy",
    model: "Early camera phone (VGA-2MP)",
    // Tiny sensor + plastic lens: green cast, crushed DR, heavy noise,
    // heavy JPEG, lots of chroma noise, heavy vignette, low res
    tint: [1.0, 1.025, 0.93],
    warmth: 0.06,
    saturation: 0.95,
    contrast: 1.15,
    brightness: 0.98,
    shadowCrush: 0.36,
    highlightClip: 0.26,
    grain: 0.72,
    grainScale: 2.5,
    chromaNoise: 0.6,
    aberration: 0.0042,
    softness: 0.62,
    sharpen: 0.3,
    blockiness: 0.46,
    jpegQuality: 0.56,
    vignette: 0.42,
    vignetteRadius: 0.74,
    flashTint: [1.0, 0.98, 1.025],
    sensorMaxSize: 1024,
  },
];

export function getPreset(id: PresetId): DigicamPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

// ---------------------------------------------------------------------------
// Pipeline uniforms — the data fed into the WebGL fragment shader per frame.
// ---------------------------------------------------------------------------

export interface PipelineUniforms {
  uIntensity: number;
  uTime: number;
  uISOBoost: number; // 0..1 — global noise boost for low-light scenes
  uTint: [number, number, number];
  uWarmth: number;
  uSaturation: number;
  uContrast: number;
  uBrightness: number;
  uShadowCrush: number;
  uHighlightClip: number;
  uGrainAmount: number;
  uGrainScale: number;
  uChromaNoise: number;
  uVignette: number;
  uVignetteRadius: number;
  uAberration: number;
  uSoftness: number;
  uBlockiness: number;
  uSharpen: number;
  uFlashOn: number;
  uFlashTint: [number, number, number];
  uMirror: number;
  // ---- Video-mode uniforms (distinct camcorder profile) ----
  // All default to 0 / off so photo rendering is unaffected unless a caller
  // explicitly enables video mode via `withVideo()`.
  uReferenceBase: number; // 0 = legacy photo presets, 1 = shared reference base on
  uVideoMode: number; // 0 = photo, 1 = video (enables video-only interlace stage)
  uVideoSoftness: number;
  uChromaBleed: number;
  uBloomThreshold: number;
  uInterlace: number;
  uInterlaceMotion: number;
  uBlowoutThreshold: number;
  uStreakAmount: number;
  uHazeLift: number;
  uHazeReduce: number;
  uVideoGrain: number;
  uVideoGrainScale: number;
  uVideoVignette: number;
  uVideoVignetteRadius: number;
  /** object-cover UV sub-rect (minX,minY,maxX,maxY); (0,0,1,1) = no crop */
  uCoverUv: [number, number, number, number];
  /** video warm-tint override [R,G,B] multipliers (~3500K); [1,1,1] = no override */
  uWarmTint: [number, number, number];
  /** video saturation override (0..1.5); -1 = no override (use preset) */
  uVideoSaturation: number;
}

/**
 * Build the shader uniform set for a given preset + intensity + flash.
 * At intensity 0 the look is near-identity (clean feed); at 1 the full
 * camera signature is applied. The blend is perceptually linear:
 * color-science grades blend from neutral, while grain/blockiness/CA
 * scale directly (they should be invisible at subtle).
 */
export function presetToUniforms(
  preset: DigicamPreset,
  intensity: number,
  opts: {
    time: number;
    isoBoost?: number;
    flashOn: boolean;
    mirror?: boolean;
  },
): PipelineUniforms {
  const k = clamp(intensity, 0, 1);
  const iso = clamp(opts.isoBoost ?? 0.3, 0, 1);

  // Color science: blend tint/warmth/sat/contrast/brightness from neutral
  // toward the preset's full signature using k.
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lerpArr = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
    [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  return {
    uIntensity: k,
    uTime: opts.time,
    uISOBoost: iso,
    // tint blends from [1,1,1] toward the preset tint
    uTint: lerpArr([1, 1, 1], preset.tint, k),
    uWarmth: preset.warmth * k,
    uSaturation: lerp(1, preset.saturation, k),
    uContrast: lerp(1, preset.contrast, k),
    uBrightness: lerp(1, preset.brightness, k),
    // DR crush/clip scale with k
    uShadowCrush: preset.shadowCrush * k,
    uHighlightClip: preset.highlightClip * k,
    // noise scales with k AND iso (low light boosts noise)
    uGrainAmount: preset.grain * k * (0.6 + iso * 0.8),
    uGrainScale: preset.grainScale,
    uChromaNoise: preset.chromaNoise * k * (0.6 + iso * 0.9),
    // optics
    uAberration: preset.aberration * k,
    uSoftness: preset.softness * k,
    uBlockiness: preset.blockiness * k,
    uSharpen: preset.sharpen * (0.4 + k * 0.6),
    // vignette
    uVignette: preset.vignette * k,
    uVignetteRadius: preset.vignetteRadius,
    // flash
    uFlashOn: opts.flashOn ? 1 : 0,
    uFlashTint: preset.flashTint,
    uMirror: opts.mirror ? 1 : 0,
    // video-mode uniforms default OFF — photo rendering is unaffected unless
    // a caller merges in a VideoProfile via withVideo().
    uReferenceBase: 0,
    uVideoMode: 0,
    uVideoSoftness: 0,
    uChromaBleed: 0,
    uBloomThreshold: 1.0,
    uInterlace: 0,
    uInterlaceMotion: 0,
    uBlowoutThreshold: 1.0,
    uStreakAmount: 0,
    uHazeLift: 0,
    uHazeReduce: 0,
    uVideoGrain: 0,
    uVideoGrainScale: 1.0,
    uVideoVignette: 0,
    uVideoVignetteRadius: 1.0,
    uCoverUv: [0, 0, 1, 1],
    uWarmTint: [1, 1, 1], // no override by default
    uVideoSaturation: -1, // -1 = use preset's saturation
  };
}

/**
 * Merge a VideoProfile into a PipelineUniforms set, enabling the video-mode
 * shader stages. The video look layers ON TOP of the photo preset's color
 * science (so a "PowerShot video" still reads warm) but adds the heavier
 * camcorder artifacts. Intensity scales the video stages too.
 */
export function withVideo(
  base: PipelineUniforms,
  profile: VideoProfile,
  intensity: number,
): PipelineUniforms {
  const k = clamp(intensity, 0, 1);
  // Blend the warm tint from neutral [1,1,1] toward the profile's warmTint,
  // scaled by intensity — so at intensity 0 video = photo color, at 1 = full
  // warm cast matching the reference.
  const wt = profile.warmTint;
  const warmTint: [number, number, number] = [
    1 + (wt[0] - 1) * k,
    1 + (wt[1] - 1) * k,
    1 + (wt[2] - 1) * k,
  ];
  return {
    ...base,
    uReferenceBase: 1, // shared reference base on (softness, bleed, blowout, haze, grain, vignette)
    uVideoMode: 1, // video-only interlace stage on (interlace value itself may be 0 for progressive refs)
    uSharpen: 0, // reference has NO in-camera sharpening (no halos) — disable in video mode
    uVideoSoftness: profile.softness * k,
    uChromaBleed: profile.chromaBleed * k,
    uBloomThreshold: profile.bloomThreshold,
    uInterlace: profile.interlace * k,
    uInterlaceMotion: profile.interlaceMotion,
    uBlowoutThreshold: profile.blowoutThreshold,
    uStreakAmount: profile.streakAmount * k,
    uHazeLift: profile.hazeLift * k,
    uHazeReduce: profile.hazeReduce * k,
    uVideoGrain: profile.grain * k,
    uVideoGrainScale: profile.grainScale,
    uVideoVignette: profile.vignette * k,
    uVideoVignetteRadius: profile.vignetteRadius,
    uWarmTint: warmTint,
    uVideoSaturation: profile.saturation,
  };
}

/**
 * Enable the SHARED reference-base stages on a photo PipelineUniforms set —
 * heavy softness, chroma bleed, highlight blowout + streak, low-contrast
 * haze, heavy grain, vignette — WITHOUT the video-only interlace stage.
 * This brings photos up to the same accuracy bar as the reference frame,
 * so photo and video look like the same camera's sensor+lens.
 */
export function withReferenceBase(
  base: PipelineUniforms,
  profile: VideoProfile,
  intensity: number,
): PipelineUniforms {
  const k = clamp(intensity, 0, 1);
  return {
    ...withVideo(base, profile, intensity),
    uVideoMode: 0, // interlace OFF for photos
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
