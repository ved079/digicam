"use client";

import { Camera, Images, User } from "lucide-react";
import { useDigiCam, type Tab } from "@/lib/digicam/store";
import { cn } from "@/lib/utils";

const TABS: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: "gallery", label: "Gallery", icon: Images },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "profile", label: "Profile", icon: User },
];

export function BottomTabs() {
  const tab = useDigiCam((s) => s.tab);
  const setTab = useDigiCam((s) => s.setTab);

  return (
    <nav
      className="relative z-30 flex items-center justify-around border-t border-border bg-background/95 backdrop-blur-md px-2"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom, 0px))" }}
      aria-label="Primary"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        const isCamera = id === "camera";
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "tap-scale relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5",
              "min-h-[52px]",
            )}
          >
            {/* active dot indicator */}
            <span
              className={cn(
                "absolute top-1 h-1 rounded-full bg-accent transition-all duration-200",
                active ? "w-1 opacity-100" : "w-1 opacity-0",
              )}
            />
            {isCamera ? (
              // Camera is the primary — render as a filled accent disc.
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200",
                  active
                    ? "bg-accent text-accent-foreground shadow-[0_6px_18px_-4px_var(--accent)]"
                    : "bg-secondary text-foreground/70",
                )}
              >
                <Icon size={22} strokeWidth={2} />
              </span>
            ) : (
              <Icon
                size={24}
                strokeWidth={active ? 2.4 : 1.8}
                className={cn(
                  "transition-colors duration-200",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              />
            )}
            <span
              className={cn(
                "text-[10px] tracking-wide transition-colors duration-200",
                active
                  ? isCamera
                    ? "text-accent font-medium"
                    : "text-accent font-medium"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
