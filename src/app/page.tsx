"use client";

import * as React from "react";
import { MobileFrame } from "@/components/digicam/MobileFrame";
import { BottomTabs } from "@/components/digicam/BottomTabs";
import { CameraScreen } from "@/components/digicam/CameraScreen";
import { GalleryScreen } from "@/components/digicam/GalleryScreen";
import { ProfileScreen } from "@/components/digicam/ProfileScreen";
import { useDigiCam } from "@/lib/digicam/store";

export default function Home() {
  const tab = useDigiCam((s) => s.tab);
  const toast = useDigiCam((s) => s.toast);
  const selectedPhotoId = useDigiCam((s) => s.selectedPhotoId);
  const loadPhotos = useDigiCam((s) => s.loadPhotos);

  // Load persisted photos on app mount so the recent-thumbnail on the
  // camera screen and the gallery both work immediately after a reload.
  React.useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  // When a photo detail is open it behaves like a full-screen modal — hide
  // the tab bar so it doesn't clutter the viewer (native mobile pattern).
  const hideTabs = !!selectedPhotoId;

  return (
    <MobileFrame>
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Screen swap — instant view change, light fade for polish */}
        <div key={tab} className="animate-fade-in relative flex flex-1 flex-col overflow-hidden">
          {tab === "camera" && <CameraScreen />}
          {tab === "gallery" && <GalleryScreen />}
          {tab === "profile" && <ProfileScreen />}
        </div>

        {/* transient toast */}
        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-50 -translate-x-1/2">
            <div className="animate-slide-up rounded-full bg-foreground/90 px-4 py-2 text-[12px] font-medium text-background shadow-lg backdrop-blur">
              {toast}
            </div>
          </div>
        )}
      </main>

      {!hideTabs && <BottomTabs />}
    </MobileFrame>
  );
}
