// Camera hook — manages the getUserMedia stream lifecycle, attaches it
// to a <video> element, handles facing-mode flips and permission errors.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCameraOpts {
  facingMode: "user" | "environment";
  enabled: boolean;
}

export type CameraStatus = "idle" | "loading" | "ready" | "denied" | "error";

export function useCamera(opts: UseCameraOpts) {
  const { facingMode, enabled } = opts;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /** Returns the active MediaStream (may be null). */
  const getStream = useCallback(() => streamRef.current, []);

  const stop = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null;
    }
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

  useEffect(() => {
    if (!enabled) {
      stop();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- status reflects the external camera system state
      setStatus("idle");
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
      stop();
    };
  }, [enabled, facingMode, start, stop]);

  return { videoRef, status, error, start, stop, getStream };
}
