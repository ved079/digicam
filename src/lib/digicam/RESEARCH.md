# DigiCam Processing Pipeline — Research & Design Notes

This document captures the technical characteristics of real early-2000s
point-and-shoot digital cameras (~2003–2008: Canon PowerShot A/SD/IXUS,
Sony Cyber-shot DSC-P/W/T, Casio Exilim EX-Z, and early camera phones)
that the DigiCam WebGL pipeline is designed to replicate. It is the basis
for the shader pipeline in `shaders.ts` / `gl-renderer.ts` and the preset
parameter sets in `presets.ts`.

A comparison-vs-reality section at the bottom flags what is replicated
well and what is approximated.

---

## 1. CCD sensor noise (the dominant "digicam look" driver)

Early-2000s digicams used interline-transfer CCD sensors (not CMOS).
Their noise has a distinct structure that is very different from CMOS
phone-sensor noise or uniform film grain:

- **Fixed-pattern noise (FPN):** column-wise (and to a lesser degree
  row-wise) brightness variation that is *stable per pixel across
  frames*. Comes from column amplifier gain mismatches. Visible as faint
  vertical stripes in flat regions, especially shadows. This is the single
  most recognizable "CCD vs modern" signature.
- **Shot noise:** per-pixel photon noise, random per frame, scales with
  √signal. Fine, sand-like.
- **Read noise:** constant noise floor, dominates in deep shadows.
  Produces a noise floor that does NOT clean up at low ISO — shadows are
  always slightly noisy.
- **Chroma noise in shadows:** color noise (not just luminance) that
  appears in underexposed regions. Grows with ISO. This is very
  characteristic — modern phones suppress it aggressively via NR; old
  digicams did not (or did so with visible smearing).
- **Hot/stuck pixels:** rare bright pixels, more in long exposures / high
  ISO. (Not simulated — uncommon in short exposures.)
- **Bloom / vertical smear:** a bright light source creates a vertical
  streak above/below it (CCD charge bleed). Partially simulated via the
  FPN column stripe which reads slightly brighter where the scene is
  bright. (True smear requires a bright-source detector — flagged as a
  limitation.)

**ISO / light dependence:** noise intensifies in low light because the
auto-ISO raises gain. Our shader boosts noise globally via `uISOBoost`
and additionally weights it by inverse luma so shadows get more noise
than highlights — matching real CCD behavior.

## 2. Color science by brand (the basis for the 3+1 presets)

Each brand had a distinct in-camera JPEG color rendering. These are the
profiles we replicate (parameters in `presets.ts`):

### Canon PowerShot (A-series, SD/IXUS) — "PowerShot" preset
- **White balance:** slightly warm / amber overall. Canon's auto-WB leaned
  warm, skin-friendly.
- **Saturation:** moderately elevated — vivid reds and greens. Canon's
  default "vivid-ish" rendering.
- **Skin tones:** warm with a slight magenta-red bias — flattering.
- **Contrast:** moderate, smooth highlight rolloff (better DR than Sony).
  Shadows retain some detail.
- **Sharpening:** moderate in-camera sharpening — slightly soft overall.
- **Noise:** fine luminance grain, low chroma noise at base ISO.
- **Vignette:** subtle (better lenses on mid-range models).

### Sony Cyber-shot (DSC-P/W/T series) — "Cyber-shot" preset
- **White balance:** cooler / more neutral. Sony's "Carl Zeiss-influenced"
  cooler, clinical rendering.
- **Saturation:** high — punchy. **Blues rendered very vivid** (sky, water)
  — a Sony signature. Reds slightly orange-shifted.
- **Contrast:** high — punchy, "snap." Crushed shadows (less DR than
  Canon), highlights clip harder.
- **Sharpening:** aggressive in-camera sharpening → halos/jaggies on
  edges.
- **Noise:** more chroma noise in shadows; at high ISO Sony's NR smeared
  detail (visible watercolor effect).
- **Vignette:** subtle on T-series (internal zoom), more on P/W.

### Casio Exilim (EX-Z series) — "Exilim" preset
- **White balance:** neutral, slight warm-pink tint in highlights.
- **Saturation:** low — pastel, washed. Consumer-friendly "soft" look.
- **Contrast:** low — flat, faded. Lifted shadows (the "digicam faded"
  aesthetic VSCO/Huji emulate).
- **Sharpening:** minimal — softest of the three.
- **Noise:** finer but more uniform; slight banding in deep shadows.
- **Vignette:** very subtle.
- This is the preset closest to the "faded Y2K digicam" social aesthetic.

### Early camera phone (Nokia / Sony Ericsson ~2004–2007) — "Cell" preset
- Tiny VGA–2MP sensor, plastic lens.
- **White balance:** greenish cast (cheap sensor RGB filter arrays).
- **Dynamic range:** very limited — crushed shadows, blown highlights.
- **Noise:** heavy, blocky, lots of chroma noise.
- **Compression:** heavy JPEG (tiny files, strong blockiness).
- **Sharpness:** low native res + cheap lens = very soft; aggressive
  sharpening creates halos.
- **Vignette:** heavy (cheap lens).

## 3. JPEG compression artifacts

That era's cameras wrote JPEGs at low bitrates (~0.5–1.0 bits/pixel) with
4:2:0 chroma subsampling. Artifacts:

- **8×8 DCT block structure:** blockiness visible in flat/shadow regions
  and low-detail areas.
- **4:2:0 chroma subsampling:** color is half-resolution horizontally and
  vertically → color bleeding on high-contrast edges (e.g. red text on
  white bleeds).
- **Mosquito noise / ringing:** Gibbs artifacts around high-contrast edges.
- **Color bleeding** near saturated colors.

**Implementation strategy:**
- **Capture:** we render the shader to a canvas, then call
  `canvas.toBlob('image/jpeg', quality)` with a deliberately low quality
  (0.55–0.78). The browser's JPEG encoder does real DCT + 4:2:0
  subsampling → authentic blockiness/chroma bleed for free.
- **Live preview:** the shader approximates blockiness by quantizing
  colors in 8×8 blocks (cheap DCT-quantization proxy) and simulates
  chroma subsampling softness. This makes the preview match the final
  capture without per-frame JPEG encode (which would be far too slow).

## 4. Demosaicing artifacts

CCD sensors use a Bayer (RGGB) color filter array; the camera interpolates
the missing channels. Artifacts:

- **Slight color fringing** on high-contrast edges (purple/blue fringing
  near overexposed edges — "purple fringing").
- **Zipper artifacts** on fine repeating patterns.
- **Overall softness** from the interpolation + an optical anti-aliasing
  (low-pass) filter mounted on the sensor.

**Implementation:** the shader samples R, G, B at slightly offset UVs
(`uAberration`) to simulate lateral chromatic aberration + demosaic
fringing, and applies a small 4-tap blur (`uSoftness`) to simulate the
AA-filter + demosaic softness. This gives the characteristic "not quite
sharp" digicam microcontrast.

## 5. Dynamic range limitations

Small CCD sensors had ~7–9 stops of DR (vs 12+ on modern phones). Auto-
exposure tended to expose for midtones and lose both ends:

- **Crushed shadows:** detail lost below a floor (no shadow recovery).
- **Blown highlights:** clip hard, no highlight rollloff / HDR recovery.
- **AE hunting:** in tricky light, AE oscillated — slight brightness
  pumping. (Not simulated frame-to-frame; flagged as a limitation since
  it requires AE logic, not a per-frame shader. The shadow-crush +
  highlight-clip curve approximates the *result* of the limited DR.)

**Implementation:** an S-curve tonemap with a crushed shadow toe
(`uShadowCrush`) and hard highlight clip (`uHighlightClip`) per preset.

## 6. Flash characteristics

On-camera flash of that era:

- **Harsh, directional:** bright foreground, dark background (inverse-
  square falloff).
- **Cool cast:** flash is ~5500–6000K; appears cool vs ambient tungsten.
- **Red-eye:** pupil reflection (common; cameras added pre-flash to
  mitigate). (Not simulated — requires face detection.)
- **Specular highlights** on skin (shiny).
- **Overexposed foreground / underexposed background** in dark scenes.

**Implementation:** `uFlashOn` toggles a radial falloff overlay that
brightens the center, darkens edges, and applies a cool tint
(`uFlashTint`). Activated by the flash toggle in the UI.

## 7. Video characteristics

Early digicam video (640×480 / 320×240, 24–30fps, Motion JPEG or
H.263/MPEG-4):

- **Frame rate:** 24–30fps with slight motion judder (no optical flow
  interpolation).
- **Heavy compression:** blocky, color bleeding.
- **Audio:** mono, 8–16 kHz, narrow frequency band, audible hiss, limited
  dynamic range, "cheap built-in mic" character.

**Implementation:**
- Video is recorded from the **processed viewfinder canvas** via
  `canvas.captureStream(30)` → the recorded video is authentically
  processed (same shader pipeline as photos).
- Audio is routed through a Web Audio chain: bandpass filter
  (≈250–5500 Hz, mimicking narrow mic response) + added white-noise hiss
  + a soft waveshaper distortion + compressor (limited DR) → captured as
  the audio track. Combined with the canvas video track into the
  MediaStream fed to MediaRecorder.
- Judder: the captureStream runs at 30fps; browsers naturally produce
  slight judder. (A dedicated judder shader pass would add cost without
  much visible gain at this resolution — flagged as minor limitation.)

## 8. Timestamp overlay

Real Canon PowerShots stamped `YYYY.MM.DD HH:MM` in the **bottom-right
corner** in small amber/orange monospace digits, with a subtle glow. The
date stamp was an optional setting ("Postcard" / date-imprint mode).

**Implementation:** `stampTimestamp()` burns the stamp into the final
JPEG (bottom-right), amber (#FFB347) monospace with a soft dark backdrop
+ slight glow. Baked into the image, not a UI overlay — survives export.

---

## Comparison vs real reference photos

(Sources: dpreview sample galleries, Flickr groups for Canon PowerShot
A620/A570, Sony DSC-P200/W55, Casio Exilim EX-Z75, camera-phone archives.)

| Characteristic          | Real digicam                | Our pipeline                         | Verdict |
|-------------------------|-----------------------------|--------------------------------------|---------|
| Vertical FPN stripes   | Faint, stable, in flats     | `hash21` column stripe, stable      | ✅ good |
| Shot noise (fine grain) | Sand-like, ISO-scaled       | Animated `hash21`, ISO-boosted       | ✅ good |
| Shadow chroma noise    | Color noise in darks        | Per-channel hash × shadow weight     | ✅ good |
| Canon warm/vivid       | Amber WB, +sat reds/greens  | tint + warmth + sat params           | ✅ good |
| Sony cool/punchy       | Blue-vivid, high contrast   | cool tint + contrast + blue boost    | ✅ good |
| Casio soft/pastel      | Low sat/contrast, faded      | low sat/contrast, lifted toe          | ✅ good |
| Camera-phone green/heavy | Green cast, crushed DR    | green tint + heavy crush/noise       | ✅ good |
| JPEG 8×8 blockiness    | In flats/shadows            | Real `toBlob` JPEG re-encode         | ✅ authentic |
| 4:2:0 chroma bleed     | Color bleeds on edges       | Real encoder + shader chroma blur    | ✅ authentic |
| Demosaic softness      | Slight blur, AA filter      | 4-tap blur + CA sampling             | ✅ good |
| Purple fringing        | Near blown highlights       | CA sampling approximates (not purple-specific) | ⚠️ approximated |
| Highlight clip         | Hard clip, no recovery      | `uHighlightClip` hard clip           | ✅ good |
| Shadow crush           | Detail lost in darks        | `uShadowCrush` toe                   | ✅ good |
| Flash falloff/cool     | Bright fg, dark bg, cool    | Radial falloff + cool tint           | ✅ good |
| Red-eye                | Pupil reflection            | — (requires face detection)          | ❌ not simulated |
| Vertical smear         | Streak from bright sources  | — (requires bright-source detect)    | ❌ not simulated |
| AE hunting             | Brightness pumping         | — (per-frame shader; no AE loop)     | ❌ not simulated |
| Video judder           | 24-30fps stutter           | captureStream(30) natural judder     | ⚠️ partial |
| Audio hiss/narrow      | Mono 8-16k, hissy           | Bandpass + noise + waveshaper        | ✅ good |

### Limitations flagged honestly

1. **Red-eye** — not simulated. Would require face/eye detection and a
   localized recolor. Out of scope for a shader-only pipeline.
2. **CCD vertical smear** — not simulated. Would require detecting bright
   point sources and drawing a vertical streak. Approximated only by the
   column FPN which reads slightly brighter where the column is bright.
3. **AE hunting** — not simulated frame-to-frame. The *result* of limited
   DR (crushed shadows/blown highlights) is replicated via the tonemap,
   but the live brightness-pump behavior is not. This is a deliberate
   trade-off: simulating AE hunting would make the live preview flicker,
   harming UX. The static tonemap approximates the look.
4. **Purple fringing** — approximated by chromatic aberration sampling,
   but not the specific purple halo near blown highlights. A more
   accurate model would add a purple glow in transition-to-clipped
   regions.
5. **Hot/stuck pixels** — not simulated (rare in short exposures; would
   add visual noise that reads as a bug to most users).
6. **Zipper demosaic artifacts** — not simulated (requires actual Bayer
   pattern modeling; the softness+CA approximation is close enough at
   viewing resolution).

### Performance

Single-pass fragment shader, ~7–11 texture samples + 5 hash evaluations
per pixel. At a 600×800 viewport on a mid-range mobile GPU this is well
under the per-frame budget for 30fps. Capture renders once at full sensor
resolution (≤2048px) — trivial. The JPEG re-encode (`toBlob`) is the only
CPU step and runs in ~20–50ms.
