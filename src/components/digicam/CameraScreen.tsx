"use client";

import * as React from "react";
import {
  Zap,
  ZapOff,
  Timer,
  Settings,
  SwitchCamera,
  Loader2,
  Info,
  X,
} from "lucide-react";
import { useDigiCam } from "@/lib/digicam/store";
import { useCamera } from "@/lib/digicam/use-camera";
import { buildCssFilter, getPreset } from "@/lib/digicam/presets";
import { captureFrame, stampTimestamp } from "@/lib/digicam/effects";
import { savePhoto, type PhotoMeta } from "@/lib/digicam/db";
import { DEMO_SCENES, loadDemoImage } from "@/lib/digicam/demo";
import { cn } from "@/lib/utils";
import { StyleSwitcher } from "./StyleSwitcher";
import { ShutterButton } from "./ShutterButton";

const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function CameraScreen() {
  const {
    facingMode,
    toggleFacing,
    flash,
    toggleFlash,
    timer,
    cycleTimer,
    mode,
    toggleMode,
    recording,
    setRecording,
    tickRecord,
    recordStart,
    recordMs,
    preset,
    settings,
    addPhoto,
    photos,
    setTab,
    selectPhoto,
    showToast,
  } = useDigiCam();

  const { videoRef, status, error, getStream, start: restartCamera } = useCamera({
    facingMode,
    enabled: true,
  });

  const presetDef = getPreset(preset);
  const intensity = settings.intensity;
  const filterCss = buildCssFilter(presetDef, intensity);

  // Demo mode — activates when no webcam is available so the full pipeline
  // (live preview + capture + gallery) can still be experienced.
  const demoMode = status === "denied" || status === "error";
  const [demoSceneIndex, setDemoSceneIndex] = React.useState(0);
  const [demoImg, setDemoImg] = React.useState<HTMLImageElement | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    loadDemoImage(DEMO_SCENES[demoSceneIndex]).then((img) => {
      if (!cancelled) setDemoImg(img);
    });
    return () => {
      cancelled = true;
    };
  }, [demoSceneIndex]);

  const [flashOverlay, setFlashOverlay] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [showInfo, setShowInfo] = React.useState(false);

  // latest recent photo thumbnail
  const recent = photos[0];

  // MediaRecorder bits
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const recordTickRef = React.useRef<number | null>(null);

  // Clean up recorder/timers on unmount
  React.useEffect(() => {
    return () => {
      if (recordTickRef.current) window.clearInterval(recordTickRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const doFlash = () => {
    setFlashOverlay(true);
    window.setTimeout(() => setFlashOverlay(false), 320);
  };

  const capturePhoto = React.useCallback(async () => {
    // Source: the live video frame, or a demo scene when no camera is available.
    const source: HTMLVideoElement | HTMLImageElement | null = demoMode
      ? demoImg
      : videoRef.current;
    if (!source) return;
    if (!demoMode && status !== "ready") return;
    doFlash();

    try {
      const { blob, width, height } = await captureFrame(source, presetDef, {
        intensity,
        maxSize: settings.photoQuality === "high" ? 2048 : 1600,
        quality: settings.photoQuality === "high" ? 0.82 : 0.74,
      });

      const finalBlob = settings.timestamp
        ? await stampTimestamp(blob, Date.now())
        : blob;

      const meta: PhotoMeta = {
        id: uid(),
        blob: finalBlob,
        url: URL.createObjectURL(finalBlob),
        width,
        height,
        createdAt: Date.now(),
        preset,
        intensity,
        kind: "photo",
      };
      await savePhoto(meta);
      addPhoto(meta);
      setPreviewUrl(meta.url!);

      if (settings.saveLocation === "device") {
        downloadBlob(meta.blob, `digicam_${meta.id}.jpg`);
      }
      showToast("Saved to Gallery");
    } catch (e) {
      console.error(e);
      showToast("Capture failed");
    }
  }, [
    videoRef,
    status,
    demoMode,
    demoImg,
    presetDef,
    intensity,
    settings.photoQuality,
    settings.timestamp,
    settings.saveLocation,
    preset,
    addPhoto,
    showToast,
  ]);

  const runCountdown = (secs: number, cb: () => void) => {
    let n = secs;
    setCountdown(n);
    const tick = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(tick);
        setCountdown(null);
        cb();
      } else {
        setCountdown(n);
      }
    }, 1000);
  };

  const handleShutter = () => {
    if (mode === "video") {
      handleVideoToggle();
      return;
    }
    if (timer > 0 && !countdown) {
      runCountdown(timer, capturePhoto);
    } else {
      capturePhoto();
    }
  };

  const handleVideoToggle = () => {
    const stream = getStream();
    if (!stream) return;
    if (recording) {
      // stop
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      return;
    }
    if (!("MediaRecorder" in window)) {
      showToast("Video recording not supported");
      return;
    }
    try {
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const start = recordStart;
        const durationMs = Math.max(0, Date.now() - start);
        const type = rec.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        const meta: PhotoMeta = {
          id: uid(),
          blob,
          url: URL.createObjectURL(blob),
          width: videoRef.current?.videoWidth || 640,
          height: videoRef.current?.videoHeight || 480,
          createdAt: Date.now(),
          preset,
          intensity,
          kind: "video",
          durationMs,
        };
        await savePhoto(meta);
        addPhoto(meta);
        setRecording(false);
        if (recordTickRef.current) {
          window.clearInterval(recordTickRef.current);
          recordTickRef.current = null;
        }
        if (settings.saveLocation === "device") {
          downloadBlob(meta.blob, `digicam_${meta.id}.webm`);
        }
        showToast("Video saved");
      };
      recorderRef.current = rec;
      const startTs = Date.now();
      setRecording(true, startTs);
      rec.start();
      recordTickRef.current = window.setInterval(() => {
        tickRecord(Date.now() - startTs);
      }, 250);
    } catch (e) {
      console.error(e);
      showToast("Could not start recording");
    }
  };

  const openRecent = () => {
    if (!recent) return;
    selectPhoto(recent.id);
    setTab("gallery");
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0908]">
      {/* === Top overlay bar (safe area) === */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5"
        style={{ paddingTop: "max(18px, env(safe-area-inset-top, 0px))" }}
      >
        <TopIconButton
          label="Flash"
          onClick={toggleFlash}
          active={flash}
        >
          {flash ? <Zap size={20} /> : <ZapOff size={20} />}
        </TopIconButton>

        <div className="flex items-center gap-2">
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-destructive animate-rec-blink" />
              {fmtClock(recordMs)}
            </span>
          )}
          <TopIconButton
            label="Self-timer"
            onClick={cycleTimer}
            active={timer > 0}
          >
            <Timer size={20} />
            {timer > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[8px] font-bold text-accent-foreground">
                {timer}
              </span>
            )}
          </TopIconButton>
        </div>

        <TopIconButton label="Info" onClick={() => setShowInfo((v) => !v)} active={showInfo}>
          {showInfo ? <X size={20} /> : <Info size={20} />}
        </TopIconButton>
      </div>

      {/* === Viewfinder === */}
      <div className="relative flex-1 overflow-hidden">
        {/* live video feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            filter: filterCss,
            transform: facingMode === "user" ? "scaleX(-1)" : undefined,
            opacity: demoMode ? 0 : 1,
          }}
        />

        {/* demo scene viewfinder (no camera available) */}
        {demoMode && (
          <button
            type="button"
            onClick={() =>
              setDemoSceneIndex((i) => (i + 1) % DEMO_SCENES.length)
            }
            aria-label="Change demo scene"
            className="absolute inset-0 h-full w-full cursor-pointer"
          >
            <img
              src={DEMO_SCENES[demoSceneIndex]}
              alt="Demo scene preview"
              className="h-full w-full object-cover"
              style={{ filter: filterCss }}
            />
          </button>
        )}

        {/* live vignette + grain overlays for real-time preview feel */}
        {intensity > 0.02 && presetDef.vignette > 0 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(120% 120% at 50% 50%, transparent ${presetDef.vignetteRadius * 60}%, rgba(0,0,0,${presetDef.vignette * intensity * 0.7}) 100%)`,
            }}
          />
        )}
        {intensity > 0.02 && presetDef.grain > 0.15 && (
          <div
            className="pointer-events-none absolute inset-0 grain-overlay opacity-25 mix-blend-overlay"
            style={{ opacity: presetDef.grain * intensity * 0.4 }}
          />
        )}

        {/* composition grid lines */}
        {settings.gridLines && <GridLines />}

        {/* loading state */}
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0908] px-8 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-white/70" />
            <p className="text-sm text-white/60">Starting camera…</p>
          </div>
        )}

        {/* demo-mode banner */}
        {demoMode && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4"
            style={{ paddingTop: "max(76px, env(safe-area-inset-top, 0px) + 64px)" }}
          >
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-black/55 py-1.5 pl-3 pr-1.5 text-white backdrop-blur">
              <span className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                Demo · tap scene to swap
              </span>
              <button
                onClick={() => restartCamera()}
                className="tap-scale rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-medium"
              >
                Retry camera
              </button>
            </div>
          </div>
        )}

        {/* shutter flash overlay */}
        {flashOverlay && (
          <div className="animate-shutter-flash pointer-events-none absolute inset-0 bg-white" />
        )}

        {/* countdown */}
        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              key={countdown}
              className="animate-fade-in text-[88px] font-semibold leading-none text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]"
            >
              {countdown}
            </span>
          </div>
        )}

        {/* info readout overlay (digicam data detail) */}
        {showInfo && (status === "ready" || demoMode) && (
          <div className="animate-fade-in pointer-events-none absolute left-4 top-16 flex flex-col gap-0.5 rounded-lg bg-black/45 px-3 py-2 font-mono text-[10px] leading-relaxed text-amber-200/90 backdrop-blur">
            <span>PRESET · {presetDef.label.toUpperCase()}</span>
            <span>INTENSITY · {Math.round(intensity * 100)}%</span>
            <span>
              {new Date().toLocaleDateString("en-CA")}{" "}
              {new Date().toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-amber-200/50">{facingMode === "user" ? "FRONT" : "REAR"} CAM</span>
          </div>
        )}
      </div>

      {/* === Style switcher === */}
      <div className="z-20 bg-[#0a0908] pb-1 pt-2.5">
        <StyleSwitcher />
      </div>

      {/* === Intensity slider + mode toggle === */}
      <div className="z-20 flex items-center gap-3 bg-[#0a0908] px-5 py-2">
        <div className="flex flex-1 items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <div className="relative h-1 flex-1 rounded-full bg-white/15">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-accent"
              style={{ width: `${intensity * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(intensity * 100)}
              onChange={(e) =>
                useDigiCam.getState().updateSettings({
                  intensity: Number(e.target.value) / 100,
                })
              }
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Effect intensity"
            />
            <div
              className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow"
              style={{ left: `calc(${intensity * 100}% - 7px)` }}
            />
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
        </div>

        {/* photo / video pill toggle */}
        <button
          onClick={toggleMode}
          className="tap-scale relative flex h-7 w-[88px] items-center rounded-full bg-white/12 p-0.5"
          aria-label="Switch photo or video mode"
        >
          <span
            className={cn(
              "absolute top-0.5 h-6 w-[42px] rounded-full bg-white transition-all duration-200",
              mode === "video" ? "left-[42px]" : "left-0.5",
            )}
          />
          <span
            className={cn(
              "relative z-10 flex h-6 w-[42px] items-center justify-center text-[10px] font-medium transition-colors",
              mode === "photo" ? "text-black" : "text-white/70",
            )}
          >
            Photo
          </span>
          <span
            className={cn(
              "relative z-10 flex h-6 w-[42px] items-center justify-center text-[10px] font-medium transition-colors",
              mode === "video" ? "text-black" : "text-white/70",
            )}
          >
            Video
          </span>
        </button>
      </div>

      {/* === Shutter row === */}
      <div
        className="z-20 flex items-center justify-between bg-[#0a0908] px-8"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", paddingTop: 10 }}
      >
        {/* recent thumbnail */}
        <button
          onClick={openRecent}
          className="tap-scale relative h-12 w-12 overflow-hidden rounded-[14px] border border-white/15 bg-white/5"
          aria-label="Open Gallery"
        >
          {previewUrl || recent?.url ? (
            <img
              src={previewUrl || recent?.url}
              alt="Recent photo"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-white/30">
              <Settings size={16} />
            </span>
          )}
        </button>

        <ShutterButton
          mode={mode}
          recording={recording}
          onCapture={handleShutter}
          disabled={!demoMode && status !== "ready"}
        />

        {/* flip camera */}
        <button
          onClick={toggleFacing}
          className="tap-scale flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/90"
          aria-label="Flip camera"
        >
          <SwitchCamera size={22} />
        </button>
      </div>
    </div>
  );
}

function TopIconButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "tap-scale relative flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "bg-black/35 text-white/85",
      )}
    >
      {children}
    </button>
  );
}

function GridLines() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/3 top-0 h-full w-px bg-white/15" />
      <div className="absolute left-2/3 top-0 h-full w-px bg-white/15" />
      <div className="absolute left-0 top-1/3 h-px w-full bg-white/15" />
      <div className="absolute left-0 top-2/3 h-px w-full bg-white/15" />
    </div>
  );
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const t of types) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
