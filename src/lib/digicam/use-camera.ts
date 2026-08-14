// Camera hook — manages the getUserMedia stream lifecycle, attaches it
// to a <video> element, handles facing-mode flips and permission errors.
// Also exposes hardware torch (flash) capability detection + control.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCameraOpts {
  facingMode: "user" | "environment";
  enabled: boolean;
}

export type CameraStatus = "idle" | "loading" | "ready" | "denied" | "error";

/** Whether the device supports hardware torch (flash) control via the web. */
export type TorchSupport = "checking" | "supported" | "unsupported";

export function useCamera(opts: UseCameraOpts) {
  const { facingMode, enabled } = opts;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [torchSupport, setTorchSupport] = useState<TorchSupport>("checking");
  const [torchOn, setTorchOn] = useState(false);

  /** Returns the active MediaStream (may be null). */
  const getStream = useCallback(() => streamRef.current, []);

  const stop = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      // Always turn torch off before stopping tracks (battery/UX safety).
      try {
        const track = s.getVideoTracks()[0];
        if (track) {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
          if (caps?.torch) {
            void track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet & { torch: boolean }] }).catch(() => {});
          }
        }
      } catch {
        /* noop */
      }
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
  }, []);

  const start = useCallback(async () => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Camera API not available in this browser.");
      return;
    }
    setStatus("loading");
    setError(null);
    setTorchSupport("checking");
    // Stop any prior stream before re-acquiring.
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS/Safari require this attribute + a play() call.
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch {
          /* autoplay may need a user gesture; ignore */
        }
      }
      setStatus("ready");

      // Detect torch capability via getCapabilities() (Android Chrome).
      // iOS Safari has no web API for hardware flash control (Apple
      // restriction) — getCapabilities won't report torch, so this correctly
      // resolves to "unsupported" there.
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setTorchSupport(caps?.torch === true ? "supported" : "unsupported");
      } catch {
        setTorchSupport("unsupported");
      }
    } catch (e) {
      const err = e as DOMException;
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        setStatus("denied");
        setError("Camera access was denied. Enable it in your browser settings.");
      } else if (err.name === "NotFoundError") {
        setStatus("error");
        setError("No camera found on this device.");
      } else {
        setStatus("error");
        setError(err.message || "Could not start the camera.");
      }
    }
  }, [enabled, facingMode, stop]);

  /**
   * Toggle the hardware torch (continuous light, not one-shot flash).
   * Only works on devices that report torch support (Android Chrome).
   * Wrapped in try/catch — some devices misreport capability support.
   * Returns true if the requested state was applied successfully.
   */
  const setTorch = useCallback(async (on: boolean): Promise<boolean> => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as MediaTrackConstraintSet & { torch: boolean }],
      });
      setTorchOn(on);
      return true;
    } catch (e) {
      console.warn("torch applyConstraints failed", e);
      // The device misreported support — downgrade so the UI reflects reality.
      setTorchSupport("unsupported");
      setTorchOn(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Defer stop+setStatus to a microtask so we don't synchronously call
      // setState within the effect body (the stop() also resets torch state).
      void Promise.resolve().then(() => {
        stop();
        setStatus("idle");
      });
      return;
    }
    let cancelled = false;
    // Defer the async start() to a microtask so we don't synchronously call
    // setState within the effect body (avoids cascading renders).
    void Promise.resolve().then(() => {
      if (!cancelled) void start();
    });
    return () => {
      cancelled = true;
      void Promise.resolve().then(() => stop());
    };
  }, [enabled, facingMode, start, stop]);

  return { videoRef, status, error, start, stop, getStream, torchSupport, torchOn, setTorch };
}

