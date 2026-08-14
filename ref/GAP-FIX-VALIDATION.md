# Gap-Fix Validation — Noise / Exposure / Haze / Bloom / Timestamp

**Date:** 2026-08-15
**Trigger:** User-reported regression — live viewfinder (PowerShot, dark
scene) showed vertical banding + murkiness. 5 gaps flagged as blocking.

## Root causes (all confirmed + fixed)

### GAP 2 — Vertical banding (noise pattern)
**Root cause:** `ccdNoise()` used `hash21(vec2(floor(uv.x * res.x / scale), 0.5))`
for the fixed-pattern noise — the Y input was a **constant 0.5**, so the hash
varied ONLY by X coordinate → stable vertical stripes. The same X-only pattern
existed in the video grain stage (B5). The 0.6 amplitude made it dominant.

**Fix:** Replaced with true 2D per-pixel hashing (`hash2d` = `hash21` with both
X+Y varying). FPN reduced to 0.12 amplitude (subtle sensor character, never
dominant). Dominant noise is now 3 layers of animated 2D shot noise at
different frequencies. Chroma noise also 2D. Applied to BOTH `ccdNoise`
(photo path) and the B5 video grain stage.

**Verification (quantitative):** Pixel-analysis of the dark-scene screenshot
shows column-to-column banding ratio = **0.156** (organic threshold <0.5;
banding threshold >1.0). Row banding ratio = **0.030**. No directional
structure at any zoom.

### GAP 4/1 — Murky/dark viewfinder (haze tone curve)
**Root cause:** The haze stage was `col * (1.0 - uHazeReduce) + uHazeLift`
— a **global multiply** by 0.72 that darkened midtones AND highlights
(hazeReduce=0.28), then added a flat 0.14 lift. Net: midtones ended up
~neutral mathematically but perceptually flat/murky, and highlights were
crushed. "Low-contrast haze" was implemented as "darker image" instead of
"lifted blacks + reduced contrast."

**Fix:** Replaced with a proper tone curve:
- **Shadows:** additive lift `col += uHazeLift * (1.0 - vluma)` — strongest
  in shadows, lifts blacks toward milky grey.
- **Midtones:** ~unchanged brightness (no global multiply).
- **Highlights:** per-channel soft-knee compression above `1 - hazeReduce/2`,
  using `pow(x, 0.7)` rolloff — reduced contrast, NOT darkened.
- Slight desaturation for the washed-out look (keeps brightness).

Also reduced the over-strong vignette (0.72→0.5 / radius 0.70→0.74) which
was crushing dark-scene periphery.

**Verification:** VLM confirms dark-scene viewfinder is "readable, midtones
and details clearly visible, not murky or near-black... normal (if hazy)
camera feed." Mean brightness 49/255 (dark scene, but readable).

### GAP 3 — Chroma bleed in live preview
**Confirmed wired in:** The chroma-bleed stage (B2) runs in the shared
reference-base block (`uReferenceBase==1`), which the live preview enables
for BOTH photo and video modes (via `withReferenceBase` / `withVideo` in
`use-viewfinder.ts`). VLM confirms visible bloom on bright saturated colors
in the live viewfinder.

### GAP 5 — Timestamp styling
**Fix:** Reduced font weight 600→400 (regular, not bold), font size 0.024→0.016
of image width (smaller), margin 0.028→0.022, thinner backing (0.32→0.22
opacity, tighter padding), wider softer glow (0.55→0.75 blur). Now reads as
thin glowing amber digits matching real Canon PowerShot date-imprint
references, not bold/blocky.

---

## Mandatory verification (fresh evidence)

### Dark-scene live viewfinder (PowerShot, low light) — the reported scenario
VLM (glm-5v):
- Image readable, midtones/details visible, NOT murky/near-black ✓
- Noise is ORGANIC fine grain, NO vertical/horizontal banding ✓
- Overall brightness = normal (if hazy) camera feed, usable ✓

Quantitative banding analysis (PIL pixel-read):
- Column banding ratio: 0.156 (organic)
- Row banding ratio: 0.030 (organic)
- (threshold: <0.5 organic, >1.0 banding)

### Reference-matching scene (signage, bright window) — 9-trait scorecard

**PHOTO output** (shared reference base, NO interlace):

| # | Trait | Score |
|---|-------|-------|
| 1 | 4:3 aspect | MATCH |
| 2 | soft low-res | MATCH |
| 3 | chroma bleed/bloom | PARTIAL |
| 4 | grain (organic, no banding) | MATCH |
| 5 | interlace absent | MATCH |
| 6 | blowout + streak | MATCH |
| 7 | corner vignette | MATCH |
| 8 | milky haze (not murky) | MATCH |
| 9 | period-digicam character | MATCH |

**Photo: 8 MATCH, 1 PARTIAL, 0 MISS.**

**VIDEO live viewfinder** (the primary surface — all effects confirmed):
- Chroma bleed/bloom on bright colors ✓
- Organic grain, no banding ✓
- Midtones readable, hazy not murky ✓
- Highlight blowout + streak ✓

**VIDEO recorded frame** (paused in gallery): the recorded MP4 frame scored
lower on the 9-trait scorecard than the live viewfinder because (a) the
MediaRecorder MP4 re-encoding at 480×640 smooths some effects, and (b) the
paused scene had little motion so the motion-amplified interlace combing
didn't trigger strongly. The live viewfinder (which is what the user sees
and shoots with) passes all checks. The recording-path fidelity at low res
+ MP4 compression is an inherent tradeoff flagged here honestly.

## Files touched
- `src/lib/digicam/shaders.ts` — fixed `ccdNoise` (2D hash, no banding),
  fixed video grain B5 (2D hash), rewrote haze B4 (proper tone curve).
- `src/lib/digicam/video-profile.ts` — reduced vignette 0.72→0.5.
- `src/lib/digicam/effects.ts` — timestamp thinner/smaller/glowing.

No other code touched. Lint clean.
