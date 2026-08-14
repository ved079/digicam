"use client";

import * as React from "react";
import {
  ChevronRight,
  Image as ImageIcon,
  Palette,
  HardDriveDownload,
  Clock,
  Grid3x3,
  Trash2,
  Camera,
  Sparkles,
} from "lucide-react";
import { useDigiCam } from "@/lib/digicam/store";
import { PRESETS, type PresetId } from "@/lib/digicam/presets";
import { clearAllPhotos } from "@/lib/digicam/db";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export function ProfileScreen() {
  const {
    settings,
    updateSettings,
    photos,
    loadPhotos,
    showToast,
    preset,
    setPreset,
  } = useDigiCam();

  const [clearOpen, setClearOpen] = React.useState(false);

  const photoCount = photos.length;

  const clearAll = async () => {
    await clearAllPhotos();
    await loadPhotos();
    setClearOpen(false);
    showToast("Gallery cleared");
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header
        className="px-5"
        style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))", paddingBottom: 8 }}
      >
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Settings</h1>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-6">
        {/* identity card */}
        <div className="mb-5 flex items-center gap-3 rounded-[18px] border border-border bg-card p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent/15">
            <Camera className="h-6 w-6 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-foreground">DigiCam</p>
            <p className="text-[12px] text-muted-foreground">
              Y2K digital camera · v1.0.0
            </p>
          </div>
          <Sparkles className="h-4 w-4 text-muted-foreground/50" />
        </div>

        {/* default camera style */}
        <Section title="Camera">
          <Row icon={<Palette size={18} />} label="Default style">
            <select
              value={settings.defaultPreset}
              onChange={(e) => {
                const v = e.target.value as PresetId;
                updateSettings({ defaultPreset: v });
                setPreset(v);
              }}
              className="bg-transparent text-[13px] font-medium text-foreground outline-none"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronRight size={16} className="-ml-1 text-muted-foreground/60" />
          </Row>
          <Row icon={<Clock size={18} />} label="Timestamp photos">
            <Switch
              checked={settings.timestamp}
              onCheckedChange={(v) => updateSettings({ timestamp: v })}
              aria-label="Stamp timestamp"
            />
          </Row>
          <Row icon={<Grid3x3 size={18} />} label="Composition grid">
            <Switch
              checked={settings.gridLines}
              onCheckedChange={(v) => updateSettings({ gridLines: v })}
              aria-label="Composition grid"
            />
          </Row>
        </Section>

        {/* quality & saving */}
        <Section title="Quality & Saving">
          <Row icon={<ImageIcon size={18} />} label="Photo quality">
            <div className="flex items-center gap-1 rounded-full bg-secondary p-0.5">
              {(["standard", "high"] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => updateSettings({ photoQuality: q })}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors",
                    settings.photoQuality === q
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={<HardDriveDownload size={18} />} label="Save location">
            <select
              value={settings.saveLocation}
              onChange={(e) =>
                updateSettings({ saveLocation: e.target.value as "app" | "device" })
              }
              className="bg-transparent text-[13px] font-medium capitalize text-foreground outline-none"
            >
              <option value="app">App gallery</option>
              <option value="device">Device photos</option>
            </select>
            <ChevronRight size={16} className="-ml-1 text-muted-foreground/60" />
          </Row>
        </Section>

        {/* gallery management */}
        <Section title="Gallery">
          <Row icon={<ImageIcon size={18} />} label="Stored photos">
            <span className="text-[13px] text-muted-foreground">{photoCount}</span>
          </Row>
          <Dialog open={clearOpen} onOpenChange={setClearOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                disabled={photoCount === 0}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-destructive/10">
                  <Trash2 size={18} className="text-destructive" />
                </span>
                <span className="text-[14px] font-medium text-destructive">
                  Clear all photos
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-[320px] rounded-[18px]">
              <DialogHeader>
                <DialogTitle className="text-center text-[16px]">
                  Clear all photos?
                </DialogTitle>
              </DialogHeader>
              <p className="px-1 text-center text-[13px] text-muted-foreground">
                This permanently deletes all {photoCount} photo
                {photoCount === 1 ? "" : "s"} from this device. This can&apos;t be
                undone.
              </p>
              <div className="mt-2 flex gap-2.5">
                <button
                  onClick={() => setClearOpen(false)}
                  className="tap-scale flex-1 rounded-[12px] bg-secondary py-2.5 text-[13px] font-medium text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={clearAll}
                  className="tap-scale flex-1 rounded-[12px] bg-destructive py-2.5 text-[13px] font-medium text-white"
                >
                  Clear all
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </Section>

        {/* about */}
        <Section title="About">
          <Row icon={<Camera size={18} />} label="Version">
            <span className="font-mono text-[12px] text-muted-foreground">1.0.0</span>
          </Row>
          <Row icon={<Sparkles size={18} />} label="Made for nostalgia">
            <span className="text-[12px] text-muted-foreground">Y2K · CCD · Film</span>
          </Row>
        </Section>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/60">
          DigiCam renders effects entirely in your browser. Photos never leave
          this device.
        </p>
        <p className="mt-2 text-center text-[10px] font-mono text-muted-foreground/40">
          current style · {preset.toUpperCase()}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-card">
        {children}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-secondary text-foreground/70">
        {icon}
      </span>
      <span className="flex-1 text-[14px] font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}
