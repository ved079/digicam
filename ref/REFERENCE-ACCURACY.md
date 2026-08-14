# Reference-Accuracy Validation — Photo + Video

**Date:** 2026-08-15
**Reference:** `upload/pasted_image_1786737302126.jpg` — real frame from
period-accurate low-res digicam/camcorder footage (indoor transit signage,
bright blown-out window, yellow LED text).
**Test scene:** `public/demo/test-signage.png` (AI-generated indoor signage
scene matching the reference's lighting + content as closely as possible:
indoor, mixed lighting, bright window, fine text).

This is the itemized, point-by-point accuracy assessment against the
ground-truth reference, scored by VLM (glm-5v) side-by-side. Each trait was
tuned iteratively against the reference specifically, not against generic
"vintage" instincts.

---

## Architecture: shared reference base

The reference frame is VIDEO footage, but its sensor/lens character
(softness, chroma bleed, blowout, haze, grain, vignette) is shared by the
camera — photos from the same era's digicams had the same base character.
So I built a **shared reference-base stage set** (`uReferenceBase` flag in
`shaders.ts`) that runs for BOTH photo and video capture, layered on top of
the chosen photo preset's color science. The video-only **interlace** stage
(`uVideoMode` flag) runs only for video — interlace is a codec/temporal
artifact and must NOT apply to still photos.

- `withReferenceBase()` — photo path: shared base ON, interlace OFF.
- `withVideo()` — video path: shared base ON, interlace ON.

This guarantees photo and video look like the same camera's sensor+lens,
with video adding only the codec-era interlace artifact on top.

## Final VIDEO_PROFILE parameters (tuned against the reference)

| Parameter | Value | Reference target it addresses |
|-----------|-------|------------------------------|
| softness | 0.82 | ~2-3px AA, chunky pixelation |
| sensorMaxSize | 640 | SD 640 long-edge |
| chromaBleed | 1.0 | 2-4px yellow bleed into darks |
| bloomThreshold | 0.55 | bright+saturated colors bloom |
| grain | 0.95 | moderate-heavy salt-and-pepper, midtones |
| grainScale | 1.6 | 1-2px grain size |
| interlace | 0.5 | 1px vertical combing teeth (video only) |
| interlaceMotion | 0.85 | motion/edge amplification |
| blowoutThreshold | 0.70 | hard clip to white, zero detail |
| streakAmount | 1.6 | horizontal flare ~15-20% frame width |
| vignette | 0.72 | mild-moderate corner falloff |
| vignetteRadius | 0.70 | starts ~15% from edge |
| hazeLift | 0.14 | ~8-12% black lift (RGB 20-30) |
| hazeReduce | 0.28 | washed-out low contrast |
| audioLowFreq | 300 Hz | narrow mic low rolloff |
| audioHighFreq | 4800 Hz | narrow mic high rolloff |
| audioHiss | 0.08 | background hiss, mono |

## Shader stage tuning (vs reference)

- **Chroma bleed (B2):** widened to 6 taps per direction at 2.5px spacing
  with distance-weighted falloff, 2.0× chroma delta multiplier, 0.12 luma
  glow — produces the hard-core + soft-halo bleed the reference shows on
  the yellow LED text.
- **Blowout streak (B3):** extended to 6 samples at 6px spacing (up to
  ~18% frame width) with distance-weighted falloff, 0.4× intensity —
  produces the horizontal flare from blown highlights.
- **Grain (B5):** boosted multipliers (0.22/0.18/0.20) + 0.09 chroma
  speckle — visible midtone salt-and-pepper even in adequate light.
- **Vignette (B6):** 0.72 strength / 0.70 radius — clear corner darkening.

---

## 9-trait scorecard — PHOTO output vs reference

Captured via the photo pipeline (shared reference base, NO interlace).
VLM side-by-side: `upload/pasted_image_1786737302126.jpg` vs
`ref/v4-photo-detail.png`.

| # | Trait | Score | Notes |
|---|-------|-------|-------|
| 1 | 4:3 aspect ratio | **MATCH** | Portrait 3:4 (= 4:3 orientation), no stretch |
| 2 | Soft low-res detail | **MATCH** | Text soft, never crisp; chunky pixelation |
| 3 | Chroma bleed/bloom | **MATCH** | Yellow text blooms into black |
| 4 | Grain in midtones | **MATCH** | Visible noise in wall/ceiling |
| 5 | Interlace (absent) | **MATCH** | Correctly absent for a still photo |
| 6 | Highlight blowout + streak | **PARTIAL** | Blowout present; streak subtle vs reference |
| 7 | Corner vignette | **MATCH** | Darkening visible at edges/corners |
| 8 | Milky low-contrast haze | **MATCH** | Blacks are dark grey/milky, not crushed |
| 9 | Period-digicam character | **MATCH** | Strongly mimics early-2000s digicam |

**Photo: 8 MATCH, 1 PARTIAL, 0 MISS.**

## 9-trait scorecard — VIDEO output vs reference

Captured via the video pipeline (shared reference base + interlace).
VLM side-by-side: `upload/pasted_image_1786737302126.jpg` vs
`ref/v4-video-detail.png`. Recorded video confirmed 480×640 (3:4 portrait).

| # | Trait | Score | Notes |
|---|-------|-------|-------|
| 1 | 4:3 aspect ratio | **MATCH** | 480×640 (3:4 portrait) |
| 2 | Soft low-res detail | **MATCH** | Soft, low-res, visible pixelation |
| 3 | Chroma bleed/bloom | **MATCH** | Significant bloom, esp. warm tones |
| 4 | Grain in midtones | **PARTIAL** | Present; slightly more vertical than reference |
| 5 | Interlace combing | **MATCH** | Clear combing on high-contrast edges |
| 6 | Highlight blowout + streak | **MATCH** | Blowout + horizontal streaking |
| 7 | Corner vignette | **PARTIAL** | Present; slightly stylized/stronger than reference's natural falloff |
| 8 | Milky haze lifted blacks | **MATCH** | Milky, low contrast |
| 9 | Period-camcorder character | **MATCH** | Captures the period digicam/camcorder frame |

**Video: 7 MATCH, 2 PARTIAL, 0 MISS.**

---

## Iteration history

| Version | Photo (M/P/MISS) | Video (M/P/MISS) | Key change |
|---------|------------------|------------------|------------|
| v1 (baseline) | 2/2/5 | 0/1/8 | Photos used legacy presets (too clean); video had weak stages |
| v2 | 2/3/4 | — | Added shared reference base to photo path |
| v3 | 6/2/1 | 3/4/2 | Boosted chromaBleed→1.0, grain→0.95, streak wider, haze stronger |
| v4 (final) | **8/1/0** | **7/2/0** | Boosted vignette 0.5→0.72 / radius 0.78→0.70, streak 1.2→1.6, blowout 0.72→0.70 |

---

## Remaining PARTIALs (honestly flagged)

1. **Photo #6 (highlight streak):** blowout clips correctly but the
   horizontal streak reads slightly more subtle than the reference's
   pronounced flare. Pushing streakAmount higher risks over-flaring
   non-blowout scenes. Acceptable approximation.
2. **Video #4 (grain):** present and visible, but the interlace stage
   adds a slight vertical-line bias to the noise that the reference's
   pure sensor noise doesn't have. This is a minor interaction between
   the grain + interlace stages.
3. **Video #7 (vignette):** present but reads slightly more
   stylized/stronger than the reference's natural lens falloff. The
   reference's vignette is very mild; ours is tuned a touch stronger to
   read clearly at small gallery-thumbnail scales.

None of these are MISSes — all 9 traits are now genuinely matched or
close-matched for both photo and video. No trait required architecture
changes that couldn't be implemented; the interlace stage (flagged as
potentially needing new work in the spec) was already built in the
previous video-pipeline task and works correctly here.

## What did NOT need new architecture

- Interlace combing — already built as a video-only shader stage; works.
- Chroma bloom/bleed — already built; widened + strengthened here.
- Highlight blowout + streak — already built; extended here.
- All other traits — covered by existing stages, just tuned to reference.

## Files touched

- `src/lib/digicam/video-profile.ts` — VIDEO_PROFILE tuned to reference;
  also serves as the shared base for photos.
- `src/lib/digicam/shaders.ts` — restructured video stages into a shared
  `uReferenceBase` block (B1-B6) + video-only interlace (gated by
  `uVideoMode`). Boosted chroma bleed (wider taps), streak (longer),
  grain (higher multipliers).
- `src/lib/digicam/presets.ts` — added `uReferenceBase` uniform +
  `withReferenceBase()` helper (shared base, interlace OFF for photos).
- `src/lib/digicam/gl-renderer.ts` — set `uReferenceBase` uniform.
- `src/lib/digicam/effects.ts` — photo capture now layers
  `withReferenceBase()` on top of the preset color science.
- `src/lib/digicam/use-viewfinder.ts` — photo-mode live preview uses
  `withReferenceBase()`; video-mode uses `withVideo()` (with interlace).
- `src/lib/digicam/demo.ts` — added the signage test scene for comparison.
- `public/demo/test-signage.png` — AI-generated reference-matching scene.
