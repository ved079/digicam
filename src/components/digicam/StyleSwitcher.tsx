"use client";

import { PRESETS, getPreset } from "@/lib/digicam/presets";
import { useDigiCam } from "@/lib/digicam/store";
import { cn } from "@/lib/utils";
import { useRef } from "react";

/**
 * Horizontal scrollable row of camera-style presets. Tap to select;
 * selected preset shows a soft underline + accent label. Supports a
 * horizontal swipe via native scroll, with snap points.
 */
export function StyleSwitcher() {
  const preset = useDigiCam((s) => s.preset);
  const setPreset = useDigiCam((s) => s.setPreset);
  const scroller = useRef<HTMLDivElement>(null);
  const current = getPreset(preset);

  return (
    <div className="px-3">
      <div
        ref={scroller}
        className="scroll-x-none flex snap-x snap-mandatory items-center gap-2.5 overflow-x-auto pb-1"
      >
        {PRESETS.map((p) => {
          const active = p.id === preset;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={cn(
                "tap-scale flex shrink-0 snap-center flex-col items-center gap-1.5",
              )}
            >
              <span
                className={cn(
                  "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] border transition-all duration-200",
                  active
                    ? "border-accent/70 ring-2 ring-accent/30"
                    : "border-border",
                )}
              >
                {/* swatch gradient preview */}
                <span
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(140deg, ${p.swatch} 0%, #ffffff 60%, #2a2622 130%)`,
                  }}
                />
                <span className="absolute inset-0 grain-overlay opacity-30 mix-blend-overlay" />
                {active && (
                  <span className="absolute bottom-0.5 h-0.5 w-5 rounded-full bg-accent" />
                )}
              </span>
              <span
                className={cn(
                  "text-[10px] tracking-wide transition-colors duration-200",
                  active ? "text-accent font-medium" : "text-muted-foreground",
                )}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-0.5 h-3 text-center text-[10px] tracking-wide text-muted-foreground/80">
        {current.tagline}
      </p>
    </div>
  );
}
