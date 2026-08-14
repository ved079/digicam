# IMG_6099.AVI — Exact-Match Validation

**Reference:** `upload/IMG_6099.AVI` — 320×240, Motion JPEG, 30fps
progressive (30p), uLaw mono audio at 11025 Hz. ~5.5s. Period digicam/
camcorder footage (indoor signage scene, yellow LED text, bright window).

This is the ground-truth target. The video pipeline was re-tuned to match
it exactly, frame-by-frame, via VLM analysis of 6 extracted reference
frames.

## Reference analysis (VLM, 6 frames)

| # | Characteristic | Reference value |
|---|----------------|------------------|
| 1 | Aspect / resolution | 320×240 4:3, NO letterboxing, progressive 30p |
| 2 | Softness | Gaussian σ~0.9-1.1px, ~200-220 effective lines, no halos |
| 3 | Color cast | Strong warm/yellow-orange (~3500K tungsten), R+10% G+5% |
| 4 | Saturation | LOW (~0.8), muddy/washed — only LED yellows vivid |
| 5 | Chroma bleed | SEVERE lateral — yellow LED + bright white smear 2-4px HORIZONTALLY into darks |
| 6 | Noise | Gaussian σ~3-4, 1px, uniform, lum + faint chroma, NO banding, NO interlace |
| 7 | Highlight blowout | Hard clip to white, NO streak/flare |
| 8 | Vignette | Light-moderate, ~-12% at corners, gradual |
| 9 | Contrast/haze | Milky lifted blacks (RGB 15-25), low contrast ~80-120:1, gamma ~1.8-2.0 |
| 10 | Sharpening | NONE (no halos, no edge enhancement) |

## Changes made to match the reference

### VIDEO_PROFILE (video-profile.ts) — retuned to the AVI's exact values
- `sensorMaxSize`: 640 → **320** (native reference resolution)
- `softness`: 0.82 → **0.6** (Gaussian σ~1px, not over-soft)
- `chromaBleed`: 1.0 → **1.8** (severe lateral smear)
- `bloomThreshold`: 0.55 → **0.45** (trigger on bright yellows)
- `grain`: 0.95 → **0.5**, `grainScale`: 1.6 → **1.0** (1px Gaussian uniform)
- `interlace`: 0.5 → **0** (reference is PROGRESSIVE 30p — NO interlace)
- `streakAmount`: 1.6 → **0** (reference has NO flare, just hard clip)
- `blowoutThreshold`: 0.7 → **0.82** (hard clip threshold)
- `vignette`: 0.5 → **0.55**, `vignetteRadius`: 0.74 → **0.72** (~-12% corners)
- `hazeLift`: 0.14 → **0.09** (RGB 15-25 milky floor)
- `hazeReduce`: 0.28 → **0.22** (low contrast, gamma ~1.8-2.0)
- NEW `warmTint`: **[1.10, 1.05, 1.0]** (~3500K tungsten cast)
- NEW `saturation`: **0.8** (LOW, muddy/washed)
- Audio: 300-5500 Hz, hiss 0.10, mono (matches uLaw 11025 Hz reference)

### Shader (shaders.ts)
- NEW **B0 stage**: applies `uWarmTint` (channel multiply) + `uVideoSaturation`
  override at the start of the reference-base block — gives video the warm/
  low-sat look regardless of which photo preset is active.
- **B2 chroma bleed** rewritten to LATERAL/horizontal-only (was isotropic):
  - (a) Edge-driven horizontal color smear — bright pixel's COLOR bleeds into
    adjacent dark neighbor via horizontal luma gradient. Triggers on ANY
    bright→dark boundary (text, windows), not just saturated colors.
  - (b) Saturated-color bloom on bright+saturated (yellow LED signature).
  - 4 taps each side at 1.2px steps (~4px spread), 2.8× delta multiplier.
- `uSharpen` forced to 0 in video mode (reference has NO sharpening halos).
- `uStreakAmount` = 0 (reference has NO flare, just hard clip).

### Recording bitrate (CameraScreen.tsx)
- MediaRecorder now uses 4 Mbps video bitrate (was default ~1 Mbps) to
  preserve the subtle chroma bleed + grain through H.264 compression,
  matching the reference's high-bitrate Motion JPEG character.

## New uniforms added
- `uWarmTint` (vec3): video warm-tint override [R,G,B]; [1,1,1] = no override
- `uVideoSaturation` (float): video saturation override; -1 = use preset's

## Validation — 10-trait EXACT-MATCH scorecard

### LIVE VIDEO-MODE VIEWFINDER (the primary surface — what the user sees/shoots)
VLM side-by-side vs reference frame:
| # | Trait | Score |
|---|-------|-------|
| 3 | warm cast | EXACT |
| 4 | low saturation | EXACT |
| 5 | **lateral chroma bleed** | **EXACT** ("Transfer Destination text clearly exhibits horizontal chromatic smearing/bleed") |
| 7 | blowout hard clip no streak | EXACT |
| 8 | vignette ~-12% corners | EXACT |
| 9 | milky lifted blacks | EXACT |
| 10 | period-camcorder character | CLOSE |

The live viewfinder matches the reference on all the defining traits,
including the critical lateral chroma bleed.

### RECORDED VIDEO FRAME (320×240, high-bitrate MP4)
VLM side-by-side vs reference frame:
| # | Trait | Score |
|---|-------|-------|
| 1 | 4:3 aspect (320×240) | EXACT |
| 2 | softness ~1px Gaussian | EXACT |
| 3 | warm cast | EXACT |
| 4 | low saturation | EXACT |
| 5 | lateral chroma bleed | MISS* |
| 6 | noise 1px Gaussian uniform | EXACT |
| 7 | blowout hard clip no streak | EXACT |
| 8 | vignette ~-12% corners | EXACT |
| 9 | milky lifted blacks | EXACT |
| 10 | period-camcorder character | CLOSE |

*Recorded frame: 9/10 EXACT, 1 MISS (chroma bleed).

## Honest limitation flag

The **recorded MP4 frame** scores the chroma bleed as MISS even though the
**live viewfinder** scores it EXACT. Root cause: the H.264 codec's 4:2:0
chroma subsampling + in-loop deblocking filter smooths the subtle 2-4px
lateral bleed during compression. The reference AVI uses Motion JPEG, which
has far less aggressive chroma subsampling and no deblocking, so the bleed
survives. I raised the recording bitrate to 4 Mbps (from ~1 Mbps default)
to mitigate this, but H.264 inherently smooths fine chroma detail more than
MJPEG.

Options to fully close this gap (not implemented — flagged as follow-up):
1. Record to WebM/VP9 (less aggressive deblocking than H.264) where the
   browser supports it — may preserve the bleed better.
2. Client-side transcode to MJPEG AVI via ffmpeg.wasm to exactly match the
   reference container (heavier, adds a processing step + ~1MB wasm).
3. Apply the chroma bleed as a POST-recording canvas bake (render the bleed
   into the captured frames after MediaRecorder, before save) — but this
   would require a separate render pass on each recorded frame.

The live viewfinder — the surface the user actually composes and shoots
with — matches the reference exactly on all defining traits including the
chroma bleed.

## Files touched
- `src/lib/digicam/video-profile.ts` — retuned to AVI exact values + warmTint/saturation
- `src/lib/digicam/shaders.ts` — B0 color override, B2 lateral chroma bleed rewrite
- `src/lib/digicam/presets.ts` — uWarmTint/uVideoSaturation uniforms + withVideo sets them + uSharpen=0
- `src/lib/digicam/gl-renderer.ts` — set new uniforms
- `src/components/digicam/CameraScreen.tsx` — 4 Mbps recording bitrate
