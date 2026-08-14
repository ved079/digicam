"use client";

import * as React from "react";
import { CheckSquare, Images, ArrowLeft, Share2, Download, Trash2, Info, MoreHorizontal, Film } from "lucide-react";
import { useDigiCam } from "@/lib/digicam/store";
import { cn } from "@/lib/utils";
import type { PhotoMeta } from "@/lib/digicam/db";

export function GalleryScreen() {
  const photos = useDigiCam((s) => s.photos);
  const selectedPhotoId = useDigiCam((s) => s.selectedPhotoId);
  const selectPhoto = useDigiCam((s) => s.selectPhoto);
  const loadPhotos = useDigiCam((s) => s.loadPhotos);

  React.useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const selected = photos.find((p) => p.id === selectedPhotoId) || null;

  if (selected) {
    return <PhotoDetail photos={photos} current={selected} />;
  }
  return <GalleryGrid photos={photos} />;
}

function GalleryGrid({ photos }: { photos: PhotoMeta[] }) {
  const selectPhoto = useDigiCam((s) => s.selectPhoto);
  const [selectMode, setSelectMode] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const removePhoto = useDigiCam((s) => s.removePhoto);
  const showToast = useDigiCam((s) => s.showToast);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deletePicked = async () => {
    const ids = Array.from(picked);
    for (const id of ids) await removePhoto(id);
    setPicked(new Set());
    setSelectMode(false);
    showToast(`Deleted ${ids.length} photo${ids.length > 1 ? "s" : ""}`);
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* top bar */}
      <header
        className="flex items-center justify-between px-5"
        style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))", paddingBottom: 12 }}
      >
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Gallery</h1>
          <p className="text-[11px] text-muted-foreground">
            {photos.length === 0
              ? "No photos yet"
              : `${photos.length} photo${photos.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {photos.length > 0 && (
          <button
            onClick={() => {
              if (selectMode) {
                setPicked(new Set());
              }
              setSelectMode((v) => !v);
            }}
            className={cn(
              "tap-scale flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              selectMode ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground/70",
            )}
            aria-label={selectMode ? "Done selecting" : "Select photos"}
          >
            <CheckSquare size={18} />
          </button>
        )}
      </header>

      {/* grid or empty state */}
      {photos.length === 0 ? (
        <EmptyState />
      ) : selectMode && picked.size > 0 ? (
        <div className="animate-slide-up px-4 pb-4">
          <button
            onClick={deletePicked}
            className="tap-scale flex w-full items-center justify-center gap-2 rounded-[14px] bg-destructive/10 py-3 text-sm font-medium text-destructive"
          >
            <Trash2 size={16} />
            Delete {picked.size} selected
          </button>
        </div>
      ) : null}

      {photos.length > 0 && (
        <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p, i) => {
              const isPicked = picked.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    selectMode ? togglePick(p.id) : selectPhoto(p.id)
                  }
                  className="tap-scale relative aspect-square overflow-hidden rounded-[10px] bg-secondary"
                  style={{ animationDelay: `${Math.min(i, 12) * 24}ms` }}
                >
                  <img
                    src={p.url}
                    alt={`Photo ${i + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {p.kind === "video" && (
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white backdrop-blur">
                      <Film size={9} />
                      {p.durationMs ? `${Math.round(p.durationMs / 1000)}s` : "VID"}
                    </span>
                  )}
                  {selectMode && (
                    <span
                      className={cn(
                        "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                        isPicked
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-white/80 bg-black/20",
                      )}
                    >
                      {isPicked && <CheckSquare size={12} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const setTab = useDigiCam((s) => s.setTab);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-secondary">
        <Images className="h-9 w-9 text-muted-foreground/60" strokeWidth={1.4} />
      </div>
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-foreground">No photos yet</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Go take one — your shots will appear here.
        </p>
      </div>
      <button
        onClick={() => setTab("camera")}
        className="tap-scale mt-2 rounded-full bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-foreground"
      >
        Open Camera
      </button>
    </div>
  );
}

/** ---------- Detail view ---------- */

function PhotoDetail({
  photos,
  current,
}: {
  photos: PhotoMeta[];
  current: PhotoMeta;
}) {
  const selectPhoto = useDigiCam((s) => s.selectPhoto);
  const removePhoto = useDigiCam((s) => s.removePhoto);
  const showToast = useDigiCam((s) => s.showToast);
  const setTab = useDigiCam((s) => s.setTab);

  const index = photos.findIndex((p) => p.id === current.id);
  const [showInfo, setShowInfo] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const touchStartX = React.useRef<number | null>(null);
  const [dragX, setDragX] = React.useState(0);
  const [animDir, setAnimDir] = React.useState<0 | 1 | -1>(0);

  const go = (dir: 1 | -1) => {
    const next = photos[index + dir];
    if (next) {
      setAnimDir(dir);
      selectPhoto(next.id);
      window.setTimeout(() => setAnimDir(0), 180);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    setDragX(dx);
  };
  const onTouchEnd = () => {
    if (touchStartX.current === null) return;
    if (dragX < -60 && index < photos.length - 1) go(1);
    else if (dragX > 60 && index > 0) go(-1);
    setDragX(0);
    touchStartX.current = null;
  };

  // keyboard nav (desktop nicety, not load-bearing)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < photos.length - 1) go(1);
      else if (e.key === "ArrowLeft" && index > 0) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length]);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "DigiCam photo",
          files: [
            new File([current.blob], `digicam_${current.id}.${fileExtForMeta(current)}`, {
              type: current.blob.type,
            }),
          ],
        });
      } else {
        downloadBlob(current.blob, current);
        showToast("Saved to device");
      }
    } catch {
      /* user cancelled */
    }
  };

  const save = () => {
    downloadBlob(current.blob, current);
    showToast("Saved to device");
  };

  const onDelete = async () => {
    await removePhoto(current.id);
    showToast("Photo deleted");
    if (index >= photos.length - 1 && photos.length > 1) {
      selectPhoto(photos[Math.max(0, index - 1)].id);
    }
  };

  const d = new Date(current.createdAt);

  return (
    <div className="relative flex h-full w-full flex-col bg-black">
      {/* top overlay bar */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4"
        style={{ paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={() => {
            selectPhoto(null);
            setTab("gallery");
          }}
          className="tap-scale flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
          aria-label="Back to gallery"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="tap-scale flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
          aria-label="More options"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* photo / video */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {current.kind === "video" ? (
          <video
            key={current.id}
            src={current.url}
            className="max-h-full max-w-full object-contain"
            controls
            playsInline
            autoPlay
          />
        ) : (
          <img
            key={current.id}
            src={current.url}
            alt="Photo"
            className="max-h-full max-w-full object-contain transition-transform duration-200"
            style={{
              transform: `translateX(${dragX}px)`,
              opacity: Math.max(0.4, 1 - Math.abs(dragX) / 300),
            }}
          />
        )}

        {/* edge fade hint for swipe direction */}
        {dragX < -20 && index < photos.length - 1 && (
          <div className="pointer-events-none absolute right-0 top-1/2 h-16 w-16 -translate-y-1/2 rounded-l-2xl bg-gradient-to-l from-white/15 to-transparent" />
        )}
        {dragX > 20 && index > 0 && (
          <div className="pointer-events-none absolute left-0 top-1/2 h-16 w-16 -translate-y-1/2 rounded-r-2xl bg-gradient-to-r from-white/15 to-transparent" />
        )}

        {/* position indicator */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/80 backdrop-blur">
          {index + 1} / {photos.length}
        </div>

        {/* info overlay */}
        {showInfo && (
          <div className="animate-fade-in pointer-events-none absolute left-4 top-16 flex flex-col gap-0.5 rounded-lg bg-black/55 px-3 py-2 font-mono text-[10px] leading-relaxed text-amber-200/90 backdrop-blur">
            <span>
              {d.getFullYear()}.{String(d.getMonth() + 1).padStart(2, "0")}.{String(d.getDate()).padStart(2, "0")}
            </span>
            <span>
              {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
            </span>
            <span className="text-amber-200/50">
              {current.preset.toUpperCase()} · {Math.round(current.intensity * 100)}%
            </span>
            <span className="text-amber-200/50">
              {current.width}×{current.height}
            </span>
          </div>
        )}
      </div>

      {/* bottom action bar */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-around px-6"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", paddingTop: 12 }}
      >
        <ActionIcon label="Share" onClick={share}>
          <Share2 size={20} />
        </ActionIcon>
        <ActionIcon label="Info" onClick={() => setShowInfo((v) => !v)} active={showInfo}>
          <Info size={20} />
        </ActionIcon>
        <ActionIcon label="Save" onClick={save}>
          <Download size={20} />
        </ActionIcon>
        <ActionIcon label="Delete" onClick={() => setConfirmDelete(true)} danger>
          <Trash2 size={20} />
        </ActionIcon>
      </div>

      {/* delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-10 backdrop-blur-sm">
          <div className="animate-slide-up w-full rounded-[18px] bg-background p-5 text-center shadow-xl">
            <p className="text-[15px] font-medium text-foreground">Delete this photo?</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              This can&apos;t be undone.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => setConfirmDelete(false)}
                className="tap-scale flex-1 rounded-[12px] bg-secondary py-2.5 text-[13px] font-medium text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
                className="tap-scale flex-1 rounded-[12px] bg-destructive py-2.5 text-[13px] font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionIcon({
  children,
  onClick,
  label,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "tap-scale flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : danger
            ? "bg-black/40 text-red-300"
            : "bg-black/40 text-white",
      )}
    >
      {children}
    </button>
  );
}

function downloadBlob(blob: Blob, meta: PhotoMeta) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `digicam_${meta.id}.${fileExtForMeta(meta)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Derive the correct file extension for a saved photo/video from its blob's
 * actual MIME type. Critical for cross-device playback — a WebM file labeled
 * `.mp4` won't play in players that key off the extension. Photos are always
 * JPEG (the pipeline encodes to JPEG); videos map from the recorded container.
 */
function fileExtForMeta(meta: PhotoMeta): string {
  if (meta.kind === "photo") return "jpg";
  const t = (meta.blob.type || "").toLowerCase();
  if (t.includes("mp4")) return "mp4";
  if (t.includes("quicktime") || t.includes("mov")) return "mov";
  // WebM is the MediaRecorder default on Chrome/Android/Firefox
  return "webm";
}
