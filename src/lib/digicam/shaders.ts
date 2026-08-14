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

// ---- Reference-base + video-mode uniforms ----
// uReferenceBase gates the SHARED base stages (heavy softness, chroma bleed,
// highlight blowout + streak, low-contrast haze, heavy grain, vignette) that
// match the ground-truth reference frame. These run for BOTH photo and video
// when enabled, so both modes hit the same accuracy bar.
// uVideoMode additionally gates the video-ONLY stage (interlace combing) —
// interlace is a video-codec artifact and must NOT apply to still photos.
uniform int   uReferenceBase; // 0 = off (legacy photo presets), 1 = shared base on
uniform int   uVideoMode;      // 1 = video-only stages (interlace) on
uniform float uVideoSoftness;     // extra blur beyond photo softness
uniform float uChromaBleed;       // bright-saturated color bloom into darks
uniform float uBloomThreshold;    // brightness threshold for chroma bloom
uniform float uInterlace;         // alternating-line horizontal offset
uniform float uInterlaceMotion;   // motion/edge amplification of combing
uniform float uBlowoutThreshold;   // highlight hard-clip threshold
uniform float uStreakAmount;      // horizontal light streak from blowout
uniform float uHazeLift;          // black-point lift (milky haze)
uniform float uHazeReduce;         // contrast reduction
uniform float uVideoGrain;         // extra heavy grain
uniform float uVideoGrainScale;    // video grain block scale
uniform float uVideoVignette;      // video-specific vignette
uniform float uVideoVignetteRadius;
uniform vec4  uCoverUv; // sub-rect of the source texture for object-cover crop (minX,minY,maxX,maxY); default (0,0,1,1) = no crop

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
  // Remap into the object-cover sub-rect (so the source is center-cropped
  // to the canvas aspect without stretching). No-op when uCoverUv == (0,0,1,1).
  uv = mix(uCoverUv.xy, uCoverUv.zw, uv);

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

  // ====================================================================
  // SHARED REFERENCE-BASE STAGES
  // Run for BOTH photo and video when uReferenceBase == 1. These model the
  // ground-truth reference frame's sensor/lens character: heavy softness,
  // chroma bloom/bleed, highlight blowout + light streak, low-contrast haze,
  // heavy constant grain, and vignette. Photo and video share these so both
  // hit the same accuracy bar and look like the same camera's sensor+lens.
  // ====================================================================
  if (uReferenceBase == 1) {
    vec2 vpx = 1.0 / uResolution;

    // ---- B1. Heavy softness (low effective resolution + optical low-pass) ----
    // Multi-tap blur — heavier than the legacy photo AA-filter softness.
    // Simulates the downsample+upsample + cheap-lens/AA-filter softness.
    if (uVideoSoftness > 0.001) {
      vec3 b = vec3(0.0);
      float wsum = 0.0;
      for (int dx = -2; dx <= 2; dx++) {
        for (int dy = -2; dy <= 2; dy++) {
          vec2 o = vec2(float(dx), float(dy)) * vpx * 2.2;
          float w = 1.0;
          b += texture2D(uVideo, uv + o).rgb * w;
          wsum += w;
        }
      }
      b /= wsum;
      col = mix(col, b, uVideoSoftness * 0.6);
    }

    // recompute luma + saturation for bloom mask
    float vluma = dot(col, vec3(0.299, 0.587, 0.114));
    float vmaxc = max(col.r, max(col.g, col.b));
    float vminc = min(col.r, min(col.g, col.b));
    float vsat = vmaxc - vminc;

    // ---- B2. Chroma bloom / bleed ----
    // Bright saturated colors (e.g. yellow LED text) bloom/glow into
    // surrounding dark areas — cheap CCD + heavy chroma subsampling. The
    // bleed's chroma (delta from its luma) is added, weighted by a
    // bright+saturated mask, so luma stays sharper than chroma.
    if (uChromaBleed > 0.001) {
      float bloomMask = smoothstep(uBloomThreshold, 1.0, vluma) *
                        smoothstep(0.12, 0.55, vsat);
      // wider horizontal+vertical chroma bleed (6 taps each direction for a
      // 2-4px soft halo with a hard core)
      vec3 bleed = vec3(0.0);
      float wsum2 = 0.0;
      for (int s = 1; s <= 3; s++) {
        float off = float(s) * vpx.x * 2.5;
        float w = (4.0 - float(s)) / 4.0;
        bleed += texture2D(uVideo, uv + vec2(off, 0.0)).rgb * w;
        bleed += texture2D(uVideo, uv - vec2(off, 0.0)).rgb * w;
        wsum2 += w * 2.0;
        float offy = float(s) * vpx.y * 2.5;
        bleed += texture2D(uVideo, uv + vec2(0.0, offy)).rgb * w;
        bleed += texture2D(uVideo, uv - vec2(0.0, offy)).rgb * w;
        wsum2 += w * 2.0;
      }
      bleed /= max(wsum2, 0.001);
      float bluma = dot(bleed, vec3(0.299, 0.587, 0.114));
      vec3 chromaDelta = (bleed - vec3(bluma)) * bloomMask * uChromaBleed;
      col += chromaDelta * 2.0;
      // bright core bloom into luma too (visible glow)
      col += vec3(bloomMask * uChromaBleed * 0.12);
    }

    // ---- B3. Highlight blowout + horizontal light streak ----
    // Bright light sources clip hard to white with zero retained detail,
    // plus a horizontal light streak/flare — old CCD sensors bloomed badly
    // and had very limited dynamic range. This is shared (photos clip too).
    if (uBlowoutThreshold < 1.0) {
      float overExcess = smoothstep(uBlowoutThreshold, uBlowoutThreshold + 0.06, vluma);
      col = mix(col, vec3(1.0), overExcess);
      if (uStreakAmount > 0.001 && overExcess > 0.01) {
        // horizontal light streak — sample further along x (up to ~18% of
        // frame width) so the flare reads as a real bloom streak, weighted
        // by distance falloff.
        float streak = 0.0;
        for (int s = 1; s <= 6; s++) {
          float off = float(s) * vpx.x * 6.0;
          float w = (7.0 - float(s)) / 7.0;
          float sl = dot(texture2D(uVideo, uv + vec2(off, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
          streak += smoothstep(uBlowoutThreshold, 1.0, sl) * w;
          sl = dot(texture2D(uVideo, uv - vec2(off, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
          streak += smoothstep(uBlowoutThreshold, 1.0, sl) * w;
        }
        streak = clamp(streak / 7.0, 0.0, 1.0);
        col += vec3(streak * uStreakAmount * 0.4);
      }
    }

    // ---- B4. Low-contrast haze (milky, lifted blacks) ----
    // Lift the black point + reduce contrast → the hazy, washed-out quality
    // of period footage rather than punchy modern output. ~8-12% black lift.
    col = col * (1.0 - uHazeReduce) + uHazeLift;
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 0.92);

    // ---- B5. Heavy constant grain ----
    // Visible grain across flat mid-tone areas, present even in adequate
    // lighting — period sensors couldn't suppress noise like modern ones.
    if (uVideoGrain > 0.001) {
      vec2 gres = uResolution;
      float gscale = uVideoGrainScale;
      float colFpn = (hash21(vec2(floor(uv.x * gres.x / gscale), 0.5)) - 0.5) * 0.6;
      float shot = (hash21(uv * gres / gscale + uTime * 9.0) - 0.5);
      float shot2 = (hash21(uv * gres + uTime * 17.0) - 0.5) * 0.9;
      float gn = (colFpn + shot * 0.6 + shot2) * uVideoGrain;
      col.r += gn * 0.22;
      col.g += gn * 0.18;
      col.b += gn * 0.20;
      // chroma noise too (salt-and-pepper color speckle)
      col.r += (hash21(uv * gres * 0.7 + uTime * 3.1 + 5.0) - 0.5) * uVideoGrain * 0.09;
      col.b += (hash21(uv * gres * 0.7 + uTime * 3.1 + 9.0) - 0.5) * uVideoGrain * 0.09;
    }

    // ---- B6. Vignette (cheap lens elements) ----
    // Subtle, consistent corner darkening.
    if (uVideoVignette > 0.001) {
      vec2 d = uv - 0.5;
      float dist = length(d) * 2.0;
      float vig = smoothstep(uVideoVignetteRadius + 0.42, uVideoVignetteRadius - 0.42, dist);
      col *= mix(1.0, vig, uVideoVignette);
    }

    // ====================================================================
    // VIDEO-ONLY STAGE: interlace combing
    // Runs ONLY when uVideoMode == 1 (never on still photos — interlace is a
    // video-codec/temporal artifact). Alternating-line horizontal offset,
    // amplified by motion (luma delta between adjacent lines).
    // ====================================================================
    if (uVideoMode == 1 && uInterlace > 0.001) {
      float lineParity = mod(floor(uv.y * uResolution.y), 2.0);
      float aboveLuma = dot(
        texture2D(uVideo, uv + vec2(0.0, vpx.y)).rgb,
        vec3(0.299, 0.587, 0.114)
      );
      float motion = clamp(abs(vluma - aboveLuma) * 6.0, 0.0, 1.0);
      float combAmt = uInterlace * (0.4 + uInterlaceMotion * motion);
      vec2 iuv = uv + vec2(vpx.x * 1.5 * combAmt * lineParity, 0.0);
      vec3 icol = texture2D(uVideo, iuv).rgb;
      col = mix(col, icol, 0.5 * (0.3 + motion));
    }
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
  // video-mode uniforms
  "uReferenceBase",
  "uVideoMode",
  "uVideoSoftness",
  "uChromaBleed",
  "uBloomThreshold",
  "uInterlace",
  "uInterlaceMotion",
  "uBlowoutThreshold",
  "uStreakAmount",
  "uHazeLift",
  "uHazeReduce",
  "uVideoGrain",
  "uVideoGrainScale",
  "uVideoVignette",
  "uVideoVignetteRadius",
  "uCoverUv",
] as const;
