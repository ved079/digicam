// DigiCam WebGL shaders. Single-pass fragment shader that runs the full
// digicam pipeline (see RESEARCH.md) on the GPU for both live preview and
// still capture. GLSL ES 1.00 (WebGL1) for maximum device compatibility.
//
// Pipeline stages (ordered, single pass):
//   1. Mirror (front cam) + Y-flip
//   2. Chromatic aberration / demosaic fringing (offset R/B sampling)
//   3. AA-filter + demosaic softness (4-tap blur, shared with sharpen)
//   4. White-balance tint + warmth
//   5. Saturation (around luminance)
//   6. Brightness
//   7. Contrast (S-curve) + dynamic-range crush (shadow toe / highlight clip)
//   8. CCD grain — fixed-pattern column/row noise + animated shot noise
//      + chroma noise weighted toward shadows, ISO-boosted
//   9. JPEG blockiness approximation (8×8 quantization proxy)
//  10. Vignette (radial, cheap-lens)
//  11. Flash overlay (harsh falloff + cool tint)
//  12. In-camera sharpening (unsharp mask, reuses blur taps)

export const VERTEX_SHADER = `
attribute vec2 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uVideo;
uniform vec2  uResolution;
uniform float uIntensity;
uniform float uTime;
uniform float uISOBoost;

uniform vec3  uTint;
uniform float uWarmth;
uniform float uSaturation;
uniform float uContrast;
uniform float uBrightness;
uniform float uShadowCrush;
uniform float uHighlightClip;

uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uChromaNoise;

uniform float uVignette;
uniform float uVignetteRadius;

uniform float uAberration;
uniform float uSoftness;
uniform float uBlockiness;
uniform float uSharpen;

uniform int   uFlashOn;
uniform vec3  uFlashTint;

uniform float uMirror;

// --- hashing (cheap, GPU-friendly) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// CCD-style noise: fixed-pattern column/row stripe (stable per pixel)
// + animated shot noise + chroma noise in shadows.
// Returns (lumNoise, chromaR, chromaB).
vec3 ccdNoise(vec2 uv, float luma, float iso) {
  vec2 res = uResolution;
  float scale = uGrainScale;

  // Fixed-pattern: column + row stripes — stable across frames.
  // This is the most recognizable CCD signature.
  float colFpn = (hash21(vec2(floor(uv.x * res.x / scale), 0.5)) - 0.5) * 0.6;
  float rowFpn = (hash21(vec2(0.5, floor(uv.y * res.y / scale))) - 0.5) * 0.35;

  // Shot noise — animated, fine sand-like.
  float shot  = (hash21(uv * res / scale + uTime * 0.7) - 0.5);
  float shot2 = (hash21(uv * res + uTime * 13.0) - 0.5) * 0.7;

  float lum = (colFpn + rowFpn + shot * 0.5 + shot2) * (0.35 + iso * 0.85);

  // Chroma noise — concentrated in shadows (CCD trait).
  float shadowW = 1.0 - smoothstep(0.04, 0.42, luma);
  float cnR = (hash21(uv * res * 0.8 + uTime * 2.1 + 17.0) - 0.5);
  float cnB = (hash21(uv * res * 0.8 + uTime * 2.1 + 83.0) - 0.5);

  return vec3(lum, cnR * shadowW, cnB * shadowW) * iso;
}

// Tonemap: shadow crush + highlight clip (limited DR of small CCD sensors).
vec3 digicamTonemap(vec3 c, float crush, float clip) {
  // Crush shadow toe — pull darks down toward a floor.
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float crushW = smoothstep(0.35, 0.0, lum);
  c -= crush * crushW * 0.18;
  // Hard-ish highlight clip — small sensors blow highlights easily.
  float hl = 1.0 - clip;
  c = min(c, mix(1.0, hl + (1.0 - hl) * 0.6, step(hl, lum) * 0.0) + 0.0);
  // Soft highlight rolloff near clip threshold.
  c = mix(c, vec3(min(c.r, 1.0), min(c.g, 1.0), min(c.b, 1.0)), 1.0);
  return c;
}

void main() {
  vec2 uv = vUv;
  // WebGL textures from video are bottom-left origin; flip Y so the feed
  // renders upright.
  uv.y = 1.0 - uv.y;
  // Mirror for front camera (selfie).
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;

  vec2 px = 1.0 / uResolution;

  // ---- 1. Chromatic aberration / demosaic fringing ----
  vec3 col;
  float ca = uAberration;
  if (ca > 0.00005) {
    vec2 dir = uv - 0.5;
    col.r = texture2D(uVideo, uv - dir * ca).r;
    col.g = texture2D(uVideo, uv).g;
    col.b = texture2D(uVideo, uv + dir * ca).b;
  } else {
    col = texture2D(uVideo, uv).rgb;
  }

  // ---- shared neighbor taps (used by softness + sharpen) ----
  vec3 nL = texture2D(uVideo, uv + vec2(-px.x, 0.0)).rgb;
  vec3 nR = texture2D(uVideo, uv + vec2( px.x, 0.0)).rgb;
  vec3 nU = texture2D(uVideo, uv + vec2(0.0, -px.y)).rgb;
  vec3 nD = texture2D(uVideo, uv + vec2(0.0,  px.y)).rgb;
  vec3 blur = (nL + nR + nU + nD) * 0.25;

  // ---- 2. AA-filter + demosaic softness ----
  if (uSoftness > 0.001) {
    col = mix(col, blur, uSoftness * 0.45);
  }

  float luma = dot(col, vec3(0.299, 0.587, 0.114));

  // ---- 3. White-balance tint + warmth ----
  col *= uTint;
  col.r += uWarmth * 0.032;
  col.b -= uWarmth * 0.032;
  col.g += uWarmth * 0.004;

  // ---- 4. Saturation (around luminance) ----
  col = mix(vec3(luma), col, uSaturation);

  // ---- 5. Brightness ----
  col *= uBrightness;

  // ---- 6. Contrast (around 0.5) + DR crush/clip ----
  col = (col - 0.5) * uContrast + 0.5;
  col = digicamTonemap(col, uShadowCrush, uHighlightClip);

  // recompute luma after grading for shadow-weighted grain
  luma = dot(col, vec3(0.299, 0.587, 0.114));

  // ---- 7. CCD grain ----
  if (uGrainAmount > 0.001) {
    vec3 n = ccdNoise(uv, luma, uISOBoost);
    col.r += n.x * uGrainAmount * 0.15;
    col.g += n.x * uGrainAmount * 0.12;
    col.b += n.x * uGrainAmount * 0.14;
    col.r += n.y * uChromaNoise * 0.18;
    col.b += n.z * uChromaNoise * 0.18;
  }

  // ---- 8. JPEG blockiness approximation (8×8 quantization proxy) ----
  if (uBlockiness > 0.01) {
    float q = mix(32.0, 8.0, uBlockiness); // fewer levels = blockier
    vec3 quant = floor(col * q + 0.5) / q;
    col = mix(col, quant, uBlockiness * 0.35);
  }

  // ---- 9. Vignette (cheap plastic lens) ----
  if (uVignette > 0.001) {
    vec2 d = uv - 0.5;
    float dist = length(d) * 2.0;
    float vig = smoothstep(uVignetteRadius + 0.42, uVignetteRadius - 0.42, dist);
    col *= mix(1.0, vig, uVignette);
  }

  // ---- 10. Flash (harsh on-axis, cool, falloff) ----
  // Real on-camera flash: very bright overexposed center, rapid inverse-square
  // falloff to dark corners, cool daylight tint, specular highlight blowout.
  if (uFlashOn == 1) {
    vec2 d = uv - 0.5;
    float dist = length(d) * 2.0;
    // inverse-square-ish falloff — tight bright core, dark edges
    float falloff = pow(max(0.0, 1.0 - dist * 0.85), 2.6);
    // cool daylight tint applied strongly
    col *= mix(vec3(1.0), uFlashTint, 0.85);
    // bright center boost + dark edge crush
    col *= (0.5 + falloff * 1.25);
    // overexposed foreground — near-white blowout at the core
    float blow = pow(falloff, 1.8);
    col += vec3(blow * 0.22, blow * 0.21, blow * 0.24);
  }

  // ---- 11. In-camera sharpening (unsharp mask) ----
  if (uSharpen > 0.01) {
    vec3 hp = col - blur;
    col += hp * uSharpen * 0.7;
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Uniform names in the order the renderer sets them. */
export const UNIFORM_NAMES = [
  "uVideo",
  "uResolution",
  "uIntensity",
  "uTime",
  "uISOBoost",
  "uTint",
  "uWarmth",
  "uSaturation",
  "uContrast",
  "uBrightness",
  "uShadowCrush",
  "uHighlightClip",
  "uGrainAmount",
  "uGrainScale",
  "uChromaNoise",
  "uVignette",
  "uVignetteRadius",
  "uAberration",
  "uSoftness",
  "uBlockiness",
  "uSharpen",
  "uFlashOn",
  "uFlashTint",
  "uMirror",
] as const;
