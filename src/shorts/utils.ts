export function incrementLabel(label: string | number): string {
  const s = String(label);
  if (s.endsWith("K")) {
    const n = Number.parseFloat(s) + 0.1;
    return `${Math.round(n * 10) / 10}K`;
  }
  if (s.endsWith("M")) {
    const n = Number.parseFloat(s) + 0.1;
    return `${Math.round(n * 10) / 10}M`;
  }
  return String(Number.parseInt(s, 10) + 1);
}


// Startup timing log. Times are ms since navigation start (performance.now()),
// so they line up with the Network panel and Lighthouse timings.
export function perfLog(label: string, details?: Record<string, unknown>): void {
  const t = performance.now().toFixed(1);
  if (details) console.log(`[perf] +${t}ms ${label}`, details);
  else console.log(`[perf] +${t}ms ${label}`);
}

// First frame of the short (time=0) so the poster matches what the video shows
// when it starts. ~25 KB webp; CDN-cached after the first request.
export function posterUrl(playbackId: string): string {
  return `https://images.fastpix.com/${playbackId}/thumbnail.webp?time=0&height=640`;
}

// FastPix's default thumbnail (a representative frame) for grid cards. Unlike
// posterUrl it isn't the first frame, which is often black (fade-in intros).
export function thumbnailUrl(playbackId: string): string {
  return `https://images.fastpix.com/${playbackId}/thumbnail.webp?height=640`;
}
