// Access to the hls.js build that index.html loads from the CDN (the same one
// the FastPix player uses), for lightweight <video> previews.

export type HlsInstance = {
  autoLevelCapping: number;
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
};

export type HlsConstructor = {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported: () => boolean;
};

const HLS_SRC = "https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js";
const LOADER_ATTR = "data-fp-hls-loader";

let pending: Promise<HlsConstructor | null> | null = null;

export function loadHls(): Promise<HlsConstructor | null> {
  const existing = (globalThis as { Hls?: HlsConstructor }).Hls;
  if (existing) return Promise.resolve(existing);
  pending ??= new Promise((resolve) => {
    let script = document.querySelector<HTMLScriptElement>(`script[${LOADER_ATTR}]`);
    if (!script) {
      script = document.createElement("script");
      script.src = HLS_SRC;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.setAttribute(LOADER_ATTR, "1");
      document.head.appendChild(script);
    }
    const done = () => resolve((globalThis as { Hls?: HlsConstructor }).Hls ?? null);
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
  });
  return pending;
}
