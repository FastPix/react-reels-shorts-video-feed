// App-side replacements for slow FastPix startup round-trips.
//
// 1. Playlists from the build-time snapshot (vite-plugins/fastpix-startup.ts)
//    are served to hls.js from memory — no cold origin request at all.
// 2. Master playlists not in the snapshot are requested once, as early as
//    possible (prefetchMaster), and hls.js reuses that in-flight response
//    instead of making its own request.
// 3. The player's own "is this playlist OK?" fetch is skipped for masters we
//    already have, removing the duplicate request.

import snapshot from "virtual:fastpix-startup";
import type { FastPixPlayerElement } from "./types";

// Ignore signed playlists this close to their expiry.
const EXPIRY_MARGIN_S = 60 * 60;

export const masterUrl = (playbackId: string) =>
  `https://stream.fastpix.com/${playbackId}.m3u8`;

const inFlight = new Map<string, Promise<string | null>>();

function signatureFresh(text: string): boolean {
  const match = /expires=(\d+)/.exec(text);
  return !!match && Number(match[1]) - EXPIRY_MARGIN_S > Date.now() / 1000;
}

function snapshotPlaylist(url: string): string | null {
  const text = snapshot.playlists[url];
  return text && signatureFresh(text) ? text : null;
}

function cachedPlaylist(url: string): Promise<string | null> | null {
  const known = snapshotPlaylist(url);
  if (known) return Promise.resolve(known);
  const pending = inFlight.get(url);
  return pending ? pending.then((t) => (t && signatureFresh(t) ? t : null)) : null;
}

// Request a master playlist now so it's ready (or in flight) by the time the
// player asks for it. No-op if the snapshot or an earlier request covers it.
export function prefetchMaster(playbackId: string, priority: RequestPriority) {
  const url = masterUrl(playbackId);
  if (snapshotPlaylist(url) || inFlight.has(url)) return;
  inFlight.set(
    url,
    fetch(url, { mode: "cors", credentials: "omit", priority })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null),
  );
}

// Tell the player its master playlist is valid so it skips its own validation
// fetch. Only for masters we hold or have requested ourselves.
export function skipPlayerValidation(el: FastPixPlayerElement, playbackId: string) {
  const url = masterUrl(playbackId);
  if (snapshotPlaylist(url) || inFlight.has(url)) el.cache?.set(url, 200);
}

// ── hls.js playlist loader ─────────────────────────────────────────────────────
// Minimal shapes of the hls.js loader API we touch (hls.js is loaded from a CDN
// script, so its types aren't available here).
type LoaderContext = { url: string };
type LoaderCallbacks = {
  onSuccess: (
    response: { url: string; data: string },
    stats: LoadStats,
    context: LoaderContext,
    networkDetails: unknown,
  ) => void;
};
type LoadStats = {
  aborted: boolean;
  loaded: number;
  retry: number;
  total: number;
  chunkCount: number;
  bwEstimate: number;
  loading: { start: number; first: number; end: number };
  parsing: { start: number; end: number };
  buffering: { start: number; first: number; end: number };
};
type HlsLoader = {
  stats: LoadStats;
  load: (context: LoaderContext, config: unknown, callbacks: LoaderCallbacks) => void;
  abort: () => void;
  destroy: () => void;
  getCacheAge?: () => number | null;
  getResponseHeader?: (name: string) => string | null;
};
type HlsGlobal = { DefaultConfig: { loader: new (config: unknown) => HlsLoader } };

const newStats = (): LoadStats => ({
  aborted: false,
  loaded: 0,
  retry: 0,
  total: 0,
  chunkCount: 0,
  bwEstimate: 0,
  loading: { start: 0, first: 0, end: 0 },
  parsing: { start: 0, end: 0 },
  buffering: { start: 0, first: 0, end: 0 },
});

// Serves playlists we already have; delegates everything else to hls.js's
// default loader. hls.js constructs it after its script has loaded.
class StartupPlaylistLoader implements HlsLoader {
  private inner: HlsLoader;
  private ownStats: LoadStats | null = null;
  private cancelled = false;
  context: LoaderContext | null = null;

  constructor(config: unknown) {
    const Hls = (globalThis as unknown as { Hls: HlsGlobal }).Hls;
    this.inner = new Hls.DefaultConfig.loader(config);
  }

  get stats(): LoadStats {
    return this.ownStats ?? this.inner.stats;
  }

  load(context: LoaderContext, config: unknown, callbacks: LoaderCallbacks) {
    this.context = context;
    const cached = cachedPlaylist(context.url);
    if (!cached) {
      this.inner.load(context, config, callbacks);
      return;
    }
    const stats = newStats();
    stats.loading.start = performance.now();
    cached.then((text) => {
      if (this.cancelled) return;
      if (text == null) {
        this.inner.load(context, config, callbacks);
        return;
      }
      stats.loading.first = stats.loading.end = performance.now();
      stats.loaded = stats.total = text.length;
      this.ownStats = stats;
      callbacks.onSuccess({ url: context.url, data: text }, stats, context, null);
    });
  }

  abort() {
    this.cancelled = true;
    if (this.ownStats) this.ownStats.aborted = true;
    this.inner.abort();
  }

  destroy() {
    this.cancelled = true;
    this.inner.destroy();
  }

  getCacheAge() {
    return this.inner.getCacheAge?.() ?? null;
  }

  getResponseHeader(name: string) {
    return this.inner.getResponseHeader?.(name) ?? null;
  }
}

// hls.js config for a short: our playlist loader, plus the start level that
// matches the segments index.html preloaded (snapshot shorts only).
export function startupHlsConfig(playbackId: string): Record<string, unknown> {
  const config: Record<string, unknown> = { pLoader: StartupPlaylistLoader };
  const startLevel = snapshot.startLevels[playbackId];
  if (startLevel != null && snapshotPlaylist(masterUrl(playbackId))) {
    config.startLevel = startLevel;
  }
  return config;
}
