// Demo-capture support — lets users experience DigiCam's effect pipeline
// even when no webcam is available (e.g. desktops, denied permission,
// headless/preview environments). Loads a bundled sample scene and feeds
// it through the same capture pipeline as a real video frame.

export const DEMO_SCENES = [
  "/demo/scene-1.png",
  "/demo/scene-2.png",
  "/demo/scene-3.png",
  // Task A reference test scenes (daylight / indoor / flash-lowlight).
  // Used for side-by-side comparison against real-camera references.
  "/demo/test-daylight.png",
  "/demo/test-indoor.png",
  "/demo/test-flash.png",
  // Reference-matching test scene (indoor signage, bright window, yellow LED text)
  "/demo/test-signage.png",
];

const imageCache = new Map<string, HTMLImageElement>();

export function loadDemoImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("demo image load failed"));
    img.src = src;
  });
}

export async function preloadDemoScenes(): Promise<void> {
  await Promise.all(DEMO_SCENES.map((s) => loadDemoImage(s).catch(() => null)));
}
