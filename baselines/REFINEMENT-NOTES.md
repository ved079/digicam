# Task A — PowerShot + Exilim Refinement Notes

**Date:** 2026-08-15
**Baseline commit:** `b86c10b` ("PowerShot + Exilim filters — approved baseline before refinement pass")
**Baseline snapshots:** `baselines/powershot-baseline.json`, `baselines/exilim-baseline.json`

This document records the research, the concrete gaps identified via
side-by-side comparison against real-camera reference traits, and the
specific parameter changes made — each change references the real-camera
trait it targets. Only the two presets in `src/lib/digicam/presets.ts`
were modified; Cyber-shot and Cell are byte-identical to the baseline.

---

## Research basis

### Canon PowerShot A620/A640 (2006–2007)
Sources: dpreview forums, imaging-resource A640 review/exposure samples,
hagensieker.com A640 review, pbase sample galleries.

Key real traits:
- **Color:** slightly OVER-saturated (~7.3% over) reds and blues, good
  hue accuracy, warm skin-tone bias, natural color with accurate auto-WB
  (except tungsten). Mean color error ~6.5.
- **Sharpening:** "reasonably sharp, without any strong over-sharpening
  or edge enhancement" (imaging-resource). No halo signature.
- **Highlights:** smooth/creamy rolloff — Canon Digic II processed
  highlights to fade gently rather than clip hard.
- **Noise:** ISO 80–100 fine and low; ISO 200 apparent but not
  significant; ISO 400 acceptable. LOW chroma noise (Canon's NR
  preserved luminance detail over color detail). Very limited purple
  fringing.
- **Shadows:** better retained detail than peers (lifted toe).

### Casio Exilim EX-Z75 (2007)
Sources: imaging-resource EX-Z75 review, cnet, reviewed.com, pbase.

Key real traits:
- **Color:** "adequately accurate but slightly under-saturated/muted"
  — the "soft pastel" rendering.
- **Sharpness:** "images are soft and a little noisy, even at ISO 100"
  (imaging-resource). Lens is a "weak component."
- **Lens:** noticeable **barrel distortion at wide angle**; significant
  **corner softness**; no optical image stabilization.
- **Dynamic range:** "mediocre" — worse than competitors, trouble
  rendering detail in bright + dark areas together.
- **Noise:** visible at ISO 100, significantly worse at ISO 200+,
  includes **color noise**; noise reduction **smears fine detail** at
  higher ISO.

---

## Concrete gaps identified (baseline vs real references)

Captured baseline output on 3 AI-generated test scenes (daylight,
indoor ambient, flash-lowlight) and compared via VLM (glm-5v) against
the researched traits.

### PowerShot gaps
1. **Sharpening halo too strong** (daylight) — crunchy edge enhancement
   on hair/straps; real A640 had no strong halo.
2. **Highlight rolloff too hard** (daylight sky) — abrupt transition to
   white; Canon is famous for creamy rolloff.
3. **Shadows too muddy/crushed** (daylight chin/hair, indoor face) —
   Canon retained better shadow detail.
4. **Indoor warmth excessively orange** — "syrupy" monochromatic cast;
   real Canon WB is warm but gentler/golden, not saturated orange.
5. **Indoor scene too clean** — looked plastic/over-NR'd; real Canon
   shows fine luminance grain even at base ISO (but low chroma noise).
6. **Flash scene background clipped to pure black** — real Canon flash
   shots keep a touch of sensor-floor noise/lift in the blacks.

### Exilim gaps
1. **Too clean** (all scenes) — no visible noise at ISO 100; real Exilim
   is "soft and a little noisy even at ISO 100."
2. **Dynamic range too high** — output retained detail in both shadows
   and highlights; real Exilim has mediocre DR (crushes shadows, blows
   highlights).
3. **Colors too rich/saturated** (daylight) — real Exilim is
   under-saturated/muted; output looked modern/vivid.
4. **Corners too sharp** — real Exilim lens is weak with significant
   corner softness + vignette falloff.
5. **Chroma noise missing in shadows** — real Exilim shows color
   noise speckling in dark areas.
6. **Barrel distortion absent** (daylight) — real Exilim has noticeable
   barrel distortion at wide angle. **(Not addressed — see limitations.)**

---

## Parameter changes (presets.ts)

Each change targets a specific gap above. Only the listed parameters
moved; all others are identical to baseline.

### PowerShot
| Parameter | Baseline | Refined | Targets gap |
|-----------|----------|---------|-------------|
| `tint[0]` (R) | 1.045 | 1.032 | #4 (greens shifting olive from over-warmth) |
| `warmth` | 0.4 | 0.28 | #4 (indoor excessively orange) |
| `shadowCrush` | 0.14 | 0.09 | #3 (shadows too muddy) |
| `highlightClip` | 0.1 | 0.06 | #2 (creamy rolloff, not hard clip) |
| `grain` | 0.34 | 0.40 | #5 (too clean — add luminance grain) |
| `chromaNoise` | 0.16 | 0.12 | #5 (Canon = LOW chroma noise) |
| `sharpen` | 0.26 | 0.16 | #1 (halo too strong/digital) |
| `flashTint` | (1.0, 0.985, 0.955) | (1.0, 0.99, 0.962) | #6 (flash bg not pure black) |

### Exilim
| Parameter | Baseline | Refined | Targets gap |
|-----------|----------|---------|-------------|
| `saturation` | 0.84 | 0.76 | #3 (too rich; real = muted) |
| `shadowCrush` | 0.1 | 0.18 | #2 (mediocre DR — crush harder) |
| `highlightClip` | 0.06 | 0.12 | #2 (mediocre DR — blow highlights) |
| `grain` | 0.3 | 0.46 | #1 (too clean — add noise) |
| `chromaNoise` | 0.2 | 0.34 | #5 (shadow chroma noise) |
| `softness` | 0.56 | 0.66 | #4 (corner softness / weak lens) |
| `vignette` | 0.14 | 0.22 | #4 (lens falloff) |
| `vignetteRadius` | 0.95 | 0.86 | #4 (tighter falloff) |

---

## Re-comparison vs baseline + references

Re-captured refined output on the same 3 scenes and ran a VLM
(glm-5v) before/after side-by-side.

### PowerShot — refined is CLOSER across all 3 scenes
- **Daylight:** more balanced contrast, less syrupy skin tones.
- **Indoor:** improved shadow handling — lifts sweater/background texture
  without losing mood.
- **Flash:** most significant improvement — recovers shadow detail on
  face/clothing vs baseline's near-black.
- *Remaining (minor):* could push luminance grain slightly more; flash
  rolloff could be softer. Acceptable — not regressing.

### Exilim — refined is CLOSER across all 3 scenes
- **Daylight:** muted/under-saturated palette now matches the "soft
  pastel" trait; baseline looked modern/vivid.
- **Indoor:** crushed shadows now mimic mediocre DR; baseline retained
  too much detail.
- **Flash:** muted cool cast matches small-digicam-flash aesthetic.
- *Remaining (minor):* chroma noise could be pushed slightly more;
  corner softness present but subtle. Acceptable.

---

## Limitations / not addressed

1. **Exilim barrel distortion** — real EX-Z75 has noticeable barrel
   distortion at wide angle. NOT simulated. Would require a UV-warp
   shader stage (geometry distortion) not present in the current
   single-pass fragment-shader pipeline. Flagged as a follow-up in
   RESEARCH.md. Adding it would be a pipeline-architecture change, not
   a preset tweak, so it's correctly out of scope for this refinement
   pass.
2. **Exilim NR smearing** — real Exilim noise reduction smears fine
   detail at high ISO into a painterly mush. Our shader adds noise but
   doesn't smear. Approximated via the softness parameter; a true
   detail-smearing pass would need a luminance-aware bilateral-blur
   stage. Acceptable approximation.
3. **Canon luminance grain** — VLM noted the refined PowerShot could
   still use slightly more luminance grain. Intentionally kept modest
   (0.40) because pushing further risks reading as "noise overlay"
   rather than authentic sensor grain; the real Canon at base ISO is
   genuinely quite clean.

## Files touched
- `src/lib/digicam/presets.ts` — PowerShot + Exilim blocks only
  (Cyber-shot and Cell verified byte-identical to baseline).
- `src/lib/digicam/demo.ts` — added 3 test scenes to the demo cycle
  for the comparison capture (revertible; not a filter change).
- `baselines/*.json` — baseline snapshots (committed at baseline).

## Revert path
`git revert <refinement-commit>` restores the approved baseline exactly.
The `baselines/*.json` files remain as an explicit, diffable fallback
independent of git history.
