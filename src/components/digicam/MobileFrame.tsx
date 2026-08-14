"use client";

import * as React from "react";

/**
 * MobileFrame — constrains the entire app to a portrait phone-sized canvas
 * (max 430px wide, full viewport height) centered on larger screens with a
 * soft neutral/blurred backdrop. Inside the frame we reserve safe-area
 * zones top (~44px) and bottom (~34px) so content never crowds the edges,
 * mimicking a real phone with notch + home-indicator.
 */
export function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] w-full bg-[#0c0b0a] flex items-stretch sm:items-center justify-center">
      {/* Ambient backdrop on larger screens */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden sm:block opacity-70"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, #2a2622 0%, #15130f 55%, #0a0908 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden sm:block"
        style={{
          backdropFilter: "blur(40px) saturate(1.1)",
          WebkitBackdropFilter: "blur(40px) saturate(1.1)",
        }}
      />

      {/* Phone frame */}
      <div
        className="relative z-10 flex flex-col w-full sm:max-w-[430px] h-[100dvh] sm:h-[920px] sm:max-h-[94vh] bg-background overflow-hidden sm:rounded-[34px] sm:border sm:border-black/10 sm:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6)]"
        data-no-select
      >
        {children}
      </div>
    </div>
  );
}
