// useViewfinder — React hook that runs the DigiCam WebGL pipeline as a
// live preview. Takes a source (hidden <video> or <img>) and renders the
// processed output onto a visible <canvas> via requestAnimationFrame.
//
// The hook also exposes the canvas ref so the CameraScreen can use
// canvas.captureStream() for processed video recording.
//
// If WebGL initialization fails (rare), it reports `failed: true` so the
// caller can fall back to a plain CSS-filtered <video>.

"use client";

import * as React from "react";
import { GLRenderer } from "./gl-renderer";
import { getPreset, presetToUniforms } from "./presets";
import type { PresetId } from "./presets";

export interface ViewfinderParams {
  preset: PresetId;
  intensity: number;
  flashOn: boolean;
  mirror: boolean;
  isoBoost: number;
}

export function useViewfinder(
  sourceRef: React.RefObject<HTMLVideoElement | HTMLImageElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  params: ViewfinderParams,
) {
  const rendererRef = React.useRef<GLRenderer | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [fps, setFps] = React.useState(0);

  // Keep latest params in a ref so the rAF loop reads fresh values without
  // restarting the loop on every change.
  const paramsRef = React.useRef(params);
  paramsRef.current = params;

  // Initialize the renderer once the canvas mounts.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    // Retry init once after a short delay — the first attempt can fail
    // during dev-mode HMR teardown when the WebGL context is briefly lost.
    const tryInit = (attempt: number): boolean => {
      try {
        rendererRef.current = new GLRenderer(canvas);
        return true;
      } catch (e) {
        if (attempt < 1) {
          // retry once on next tick
          window.setTimeout(() => {
            if (!disposed && !tryInit(1)) {
              console.warn("WebGL init failed, using CSS fallback", e);
              setFailed(true);
            }
          }, 60);
          return true; // don't flag failed yet
        }
        console.warn("WebGL init failed, using CSS fallback", e);
        setFailed(true);
        return false;
      }
    };
    if (!tryInit(0)) {
      return;
    }

    const start = performance.now();
    let frames = 0;
    let lastFpsT = start;

    const loop = () => {
      if (disposed) return;
      const src = sourceRef.current;
      const renderer = rendererRef.current;
      const canvasEl = canvasRef.current;
      if (!renderer || !canvasEl) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Size the canvas backing store to the displayed size (capped for perf).
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(canvasEl.clientWidth * dpr);
      const targetH = Math.round(canvasEl.clientHeight * dpr);
      if (
        targetW > 0 &&
        targetH > 0 &&
        (canvasEl.width !== targetW || canvasEl.height !== targetH)
      ) {
        renderer.setSize(targetW, targetH);
      }

      // Only render if the source has data (video ready or image loaded).
      const ready =
        src instanceof HTMLVideoElement
          ? src.readyState >= 2 && src.videoWidth > 0
          : src instanceof HTMLImageElement
            ? src.complete && src.naturalWidth > 0
            : false;

      if (ready) {
        const p = paramsRef.current;
        const presetDef = getPreset(p.preset);
        renderer.setSource(src);
        renderer.setUniforms(
          presetToUniforms(presetDef, p.intensity, {
            time: (performance.now() - start) / 1000,
            isoBoost: p.isoBoost,
            flashOn: p.flashOn,
            mirror: p.mirror,
          }),
        );
        renderer.renderToScreen();
      }

      // FPS meter (updates ~4x/sec)
      frames++;
      const now = performance.now();
      if (now - lastFpsT > 250) {
        setFps(Math.round((frames * 1000) / (now - lastFpsT)));
        frames = 0;
        lastFpsT = now;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
    // Re-init only if the canvas element identity changes.
  }, [canvasRef]);

  return { failed, fps };
}
