"use client";

import { cn } from "@/lib/utils";

interface ShutterButtonProps {
  mode: "photo" | "video";
  recording: boolean;
  onCapture: () => void;
  disabled?: boolean;
}

/**
 * Large circular shutter — primary visual focus of the camera screen.
 * - Photo mode: filled ring with inner disc.
 * - Video mode: outer ring + inner square when recording (red).
 * Press feedback scales to ~92%.
 */
export function ShutterButton({
  mode,
  recording,
  onCapture,
  disabled,
}: ShutterButtonProps) {
  const isVideo = mode === "video";
  return (
    <button
      type="button"
      onClick={onCapture}
      disabled={disabled}
      aria-label={isVideo ? (recording ? "Stop recording" : "Start recording") : "Take photo"}
      className={cn(
        "tap-scale relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform duration-150 active:scale-[0.92]",
        disabled && "opacity-50",
      )}
    >
      {/* outer ring */}
      <span
        className={cn(
          "absolute inset-0 rounded-full border-[3px] transition-colors duration-200",
          isVideo && recording ? "border-destructive" : "border-foreground/25",
        )}
      />
      {/* inner shape */}
      {isVideo ? (
        <span
          className={cn(
            "transition-all duration-200",
            recording
              ? "h-6 w-6 rounded-[6px] bg-destructive"
              : "h-12 w-12 rounded-full bg-destructive",
          )}
        />
      ) : (
        <span className="h-[58px] w-[58px] rounded-full bg-accent shadow-[inset_0_2px_8px_rgba(255,255,255,0.25)]" />
      )}
    </button>
  );
}
