# DigiCam — Project Worklog

A browser-based camera app that behaves like a native mobile app. Captures
photos/video with authentic early-2000s digicam aesthetics (grain, color
cast, vignette, JPEG compression, amber timestamp).

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Build the complete DigiCam web app — mobile-app layout/interactions,
3 screens (Camera/Gallery/Profile), digicam effect pipeline, IndexedDB
storage, demo fallback, and full agent-browser verification.

Work Log:
- Designed the visual system in `src/app/globals.css`: warm-cream palette
  (#FAF7F5), single coral accent (oklch 0.71 0.13 38), one app-wide radius
  (14px), 8px spacing grid, safe-area helpers, custom scrollbars, tap-scale
  feedback, shutter-flash / rec-blink / fade-in keyframes.
- Updated `src/app/layout.tsx`: DigiCam metadata + mobile viewport (no
  scaling, cover fit, theme-color) + apple-web-app tags.
- Added `allowedDevOrigins` to `next.config.ts` for the preview gateway.
- Core library in `src/lib/digicam/`:
  - `presets.ts` — 4 presets (Y2K, CCD, Film, Flash) with tint/contrast/
    grain/vignette params + `buildCssFilter()` that scales the live preview
    with intensity.
  - `effects.ts` — canvas capture pipeline: channel tint, temp shift,
    saturation around luminance, contrast/brightness, black-lift fade,
    radial vignette, blocky grain (CCD uses scale=2), JPEG compression
    pass, and `stampTimestamp()` amber mono date readout.
  - `db.ts` — IndexedDB store (photos + createdAt index) with object-URL
    caching and clear-all.
  - `store.ts` — Zustand: tab, camera state (facing/flash/timer/mode/
    recording), preset, photos, settings (persisted to localStorage),
    toast.
  - `use-camera.ts` — getUserMedia lifecycle with loading/denied/error
    states, exposes `getStream()` for MediaRecorder.
  - `demo.ts` — 3 bundled sample scenes for the no-webcam fallback.
- UI components in `src/components/digicam/`:
  - `MobileFrame.tsx` — 430px portrait frame, centered with blurred
    ambient backdrop on desktop, safe-area zones.
  - `BottomTabs.tsx` — 3 tabs (Gallery / Camera-primary-disc / Profile),
    active dot + accent indicator, safe-area bottom padding.
  - `StyleSwitcher.tsx` — snap-scrollable preset thumbnails with swatch
    gradients + grain overlay + accent underline on selection.
  - `ShutterButton.tsx` — 72px circular shutter, photo=coral disc,
    video=red dot→square, press scale 0.92.
  - `CameraScreen.tsx` — live viewfinder with CSS filter + vignette/grain
    overlays + grid lines, top overlay bar (flash/timer/info), style
    switcher, intensity slider + photo/video pill toggle, shutter row
    (recent thumb / shutter / flip), self-timer countdown, recording
    timer, MediaRecorder video capture, white flash overlay, demo-mode
    fallback (shows sample scene as viewfinder + "Retry camera").
  - `GalleryScreen.tsx` — 3-col square grid, multi-select delete, empty
    state, detail view with touch-swipe + arrow-key nav, position
    indicator, info overlay (mono timestamp + preset + dimensions),
    share/save/delete actions, delete confirmation dialog.
  - `ProfileScreen.tsx` — grouped settings list (default style, timestamp,
    grid, quality, save location, clear-all, about) with 52px min rows.
- `src/app/page.tsx` — app shell: loads photos on mount, hides bottom tab
  bar when a photo detail is open (native modal pattern), screen-swap fade.
- Generated 3 demo scene images via image-generation skill
  (`public/demo/scene-1..3.png`, 864x1152).
- Ran `bun run lint` to clean — resolved `react-hooks/set-state-in-effect`
  in the camera effect and removed unused eslint directives. Lint clean.
- Verified end-to-end with agent-browser (430x932 viewport):
  - Camera opens in demo mode (headless has no webcam), all controls
    present and enabled.
  - Switched preset (CCD/Film), captured 2 photos — flash overlay + save
    + recent thumbnail updated, no console errors.
  - Recent thumbnail → Gallery detail; swipe (ArrowRight) → photo 2/2;
    Info toggle → mono timestamp "2026.08.14 18:16 · CCD · 55% · 864x1152".
  - Back to grid (2 thumbnails + select), Profile tab (all settings),
    back to Camera via tab bar.
  - Fixed two issues surfaced by VLM review: (a) demo banner overlapped
    top-bar icons → moved down to safe+64px; (b) bottom tab bar cluttered
    the detail view → now hidden when a photo is selected.
- VLM (glm-5v) confirmed: native mobile feel, clean Y2K aesthetic, coral
  accent used consistently, all controls visible/arranged, detail view is a
  clean full-screen viewer with tab bar hidden.

Stage Summary:
- Production-quality, fully clickable DigiCam app delivered. Single route
  `/`, mobile-first single-page-app behavior, real getUserMedia camera +
  canvas digicam pipeline + IndexedDB persistence + demo fallback.
- Lint: 0 errors / 0 warnings. Dev log: all 200s, no runtime errors.
- All spec requirements met: phone frame, safe areas, 3-tab bottom nav,
  camera home default, style switcher + intensity slider (live preview),
  shutter flash + press feedback, photo/video toggle, gallery 3-col grid +
  empty state, detail swipe + info timestamp, settings list, one accent
  color, one radius, one sans + one mono font, tap-scale feedback, no hover
  dependencies, no emoji, no skeuomorphic chrome.
- Demo mode (graceful no-webcam fallback) is a genuine product addition
  that also enables full QA in headless environments.

Unresolved issues or risks, and priority recommendations for the next phase:
- Real-camera path not exercisable in headless (no webcam) — verified via
  demo mode instead. On a real device the same `captureFrame(video, ...)`
  pipeline runs; recommend a manual on-device smoke test of a live capture.
- Video recording uses MediaRecorder; some browsers cap duration / mime
  support varies (handled with a mime picker fallback).
- Next-phase ideas (for the recurring review agent): add EXIF-style
  preset badge on gallery thumbnails, a "favorites" flag, swipe-to-delete
  in the grid, a film-strip scrubber in detail view, haptic-style micro
  animations on preset switch, and a dark/cream theme toggle.
