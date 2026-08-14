// DigiCam style presets — defines the look of each digicam emulation.
// Each preset supplies a CSS filter string (for live preview) and the
// parameters consumed by the canvas capture pipeline (effects.ts).

export type PresetId = "y2k" | "ccd" | "film" | "flash";

export interface DigicamPreset {
  id: PresetId;
  label: string;
  /** swatch color used in the style switcher thumbnail */
  swatch: string;
  /** one-line mood descriptor shown under the label when selected */
  tagline: string;
  /** CSS filter applied to the live viewfinder <video> for real-time preview */
  cssFilter: string;
  /** color tint applied in canvas (rgb 0..1 multiplier per channel) */
  tint: [number, number, number];
  /** contrast multiplier centered at 0.5 (0.5 = none, >0.5 = more) */
  contrast: number;
  /** brightness multiplier (1 = none) */
  brightness: number;
  /** saturation multiplier (1 = none, <1 desaturates) */
  saturation: number;
  /** black lift — raises the floor, adds faded look (0..0.2) */
  blackLift: number;
  /** grain strength 0..1 */
  grain: number;
  /** grain scale (pixel block size) — CCD uses blockier noise */
  grainScale: number;
  /** vignette strength 0..1 */
  vignette: number;
  /** vignette radius (0.5 = tight, 1.0 = none) */
  vignetteRadius: number;
  /** warm/cool color temp shift applied to highlights */
  tempShift: number;
}

export const PRESETS: DigicamPreset[] = [
  {
    id: "y2k",
    label: "Y2K",
    swatch: "#E8B57A",
    tagline: "warm · soft · nostalgic",
    cssFilter:
      "saturate(0.92) contrast(1.05) brightness(1.03) sepia(0.18) hue-rotate(-6deg)",
    tint: [1.06, 1.0, 0.86],
    contrast: 0.56,
    brightness: 1.03,
    saturation: 0.92,
    blackLift: 0.03,
    grain: 0.4,
    grainScale: 1,
    vignette: 0.32,
    vignetteRadius: 0.72,
    tempShift: 0.12,
  },
  {
    id: "ccd",
    label: "CCD",
    swatch: "#A9C2D6",
    tagline: "cool · crisp · sensor grain",
    cssFilter:
      "saturate(1.06) contrast(1.12) brightness(1.0) hue-rotate(4deg)",
    tint: [0.92, 0.98, 1.08],
    contrast: 0.62,
    brightness: 1.0,
    saturation: 1.06,
    blackLift: 0.01,
    grain: 0.55,
    grainScale: 2,
    vignette: 0.22,
    vignetteRadius: 0.8,
    tempShift: -0.1,
  },
  {
    id: "film",
    label: "Film",
    swatch: "#C98B6A",
    tagline: "faded · grainy · warm",
    cssFilter:
      "saturate(0.82) contrast(0.96) brightness(1.05) sepia(0.28)",
    tint: [1.1, 1.02, 0.8],
    contrast: 0.48,
    brightness: 1.06,
    saturation: 0.82,
    blackLift: 0.08,
    grain: 0.7,
    grainScale: 1,
    vignette: 0.5,
    vignetteRadius: 0.66,
    tempShift: 0.2,
  },
  {
    id: "flash",
    label: "Flash",
    swatch: "#F2D4C7",
    tagline: "bright · washed · direct",
    cssFilter:
      "saturate(0.9) contrast(1.08) brightness(1.18)",
    tint: [1.05, 0.99, 0.92],
    contrast: 0.58,
    brightness: 1.16,
    saturation: 0.9,
    blackLift: 0.0,
    grain: 0.3,
    grainScale: 1,
    vignette: 0.0,
    vignetteRadius: 1.0,
    tempShift: 0.08,
  },
];

export function getPreset(id: PresetId): DigicamPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/**
 * Build a live-preview CSS filter from a preset's numeric params and the
 * current intensity (0..1). At intensity 0 the filter is near-identity so
 * the user sees a clean feed; at 1 the full digicam look is applied.
 */
export function buildCssFilter(preset: DigicamPreset, intensity: number): string {
  const k = Math.max(0, Math.min(1, intensity));
  const brightness = 1 + (preset.brightness - 1) * k;
  const contrast = 1 + (preset.contrast - 0.5) * 2 * k;
  const saturate = 1 + (preset.saturation - 1) * k;
  // warm tint -> sepia + slight hue; cool tint -> hue-rotate toward blue
  const warm = Math.max(0, preset.tempShift);
  const cool = Math.max(0, -preset.tempShift);
  const sepia = warm * 0.9 * k;
  const hue = warm * -6 * k + cool * 6 * k;
  const blur = k > 0.01 ? 0.4 * k : 0; // subtle softness
  return [
    `saturate(${saturate.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `brightness(${brightness.toFixed(3)})`,
    sepia > 0.001 ? `sepia(${sepia.toFixed(3)})` : "",
    `hue-rotate(${hue.toFixed(2)}deg)`,
    blur > 0 ? `blur(${blur.toFixed(2)}px)` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

