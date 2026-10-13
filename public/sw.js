// Instant-start cache for FastPix shorts.
//
// Why this exists: every request for a master playlist returns freshly signed
// variant/segment URLs, so the browser HTTP cache never hits on refresh even
// though segments are cacheable for 28 days. Serving the *same* master
// playlist again (while its signatures are still valid) makes the whole chain
// — variant playlists, init segments, first media segments — resolve to URLs
// we've already cached, so a refresh can start playback without the network.

const CACHE = "fp-shorts-v1";
const MAX_SEGMENT_ENTRIES = 200;
// Stop serving a cached master this long before its signed URLs expire.
const EXPIRY_MARGIN_S = 60 * 60;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Signed FastPix URLs carry `expires=<unix seconds>`.
function signatureStillValid(text) {
  const match = /expires=(\d+)/.exec(text);
  if (!match) return false;
  return Number(match[1]) - EXPIRY_MARGIN_S > Date.now() / 1000;
}

async function trimSegments(cache) {
  const keys = await cache.keys();
  const segments = keys.filter((r) => new URL(r.url).hostname === "cdn.fastpix.com");
  // Cache.keys() is in insertion order, so the oldest entries come first.
  const excess = segments.length - MAX_SEGMENT_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(segments[i]);
}

// Playlists: reuse the cached copy while its signatures are valid, otherwise
// fetch and store a fresh one. Never revalidate a valid copy — replacing it
// would change every downstream URL and defeat the segment cache.
async function playlist(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached && signatureStillValid(await cached.clone().text())) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

// Immutable assets (segments, posters, pinned hls.js): cache-first.
async function immutable(request, isSegment) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    if (isSegment) trimSegments(cache);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);

  if (url.hostname === "stream.fastpix.com" && url.pathname.endsWith(".m3u8")) {
    event.respondWith(playlist(request));
  } else if (url.hostname === "manifest-us-min-cf.fastpix.com") {
    event.respondWith(playlist(request));
  } else if (url.hostname === "cdn.fastpix.com") {
    event.respondWith(immutable(request, true));
  } else if (url.hostname === "images.fastpix.com") {
    event.respondWith(immutable(request, false));
  } else if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("/hls.js@1.7.3/")) {
    event.respondWith(immutable(request, false));
  }
});
