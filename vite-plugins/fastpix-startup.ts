// Build-time startup snapshot for the shorts feed.
//
// The cold path to the first frame is: master playlist (~0.7–1s on a cold
// FastPix origin) → variant + audio playlists → init + first segments. We
// can't change the origin, but the playlists are signed for ~30 days, so we
// fetch them once at build/dev-server start and ship them with the app:
//
//  - `virtual:fastpix-startup` exports the playlists; an hls.js playlist loader
//    (src/shorts/startup.ts) serves them from memory instead of the network.
//  - index.html gets <link rel="preload"> tags for the first short's poster,
//    init segments and first media segments, so they download in parallel
//    with the JS bundle. hls.js then finds them in the HTTP cache.
//
// Everything is best-effort: if a fetch fails the snapshot is empty and the
// app falls back to normal network loading. Expired entries are ignored at
// runtime, so a build older than the signature lifetime still works (slower).

import type { HtmlTagDescriptor, Plugin } from "vite";
import { SHORTS_FEED } from "../src/shorts/feed";

const VIRTUAL_ID = "virtual:fastpix-startup";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

// Start rendition for the first short: the smallest one at least this many
// pixels on its short side (480p ≈ 825 KB per 4 s segment vs 2.1 MB at 1080p).
const START_SHORT_SIDE = 480;

export type StartupSnapshot = {
  generatedAt: number;
  playlists: Record<string, string>;
  // hls.js level index (levels sorted by height, then bitrate) to start each
  // snapshotted short at, matching the segments preloaded from index.html.
  startLevels: Record<string, number>;
};

type Variant = { url: string; width: number; height: number; bandwidth: number };
type AudioRendition = { url: string; name: string };

const masterUrl = (id: string) => `https://stream.fastpix.com/${id}.m3u8`;
const posterUrl = (id: string) =>
  `https://images.fastpix.com/${id}/thumbnail.webp?time=0&height=640`;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

function attr(line: string, name: string): string | undefined {
  const match = new RegExp(`${name}=("([^"]*)"|[^,]*)`).exec(line);
  return match ? (match[2] ?? match[1]) : undefined;
}

function parseMaster(text: string): { variants: Variant[]; audio: AudioRendition[] } {
  const lines = text.split("\n").map((l) => l.trim());
  const variants: Variant[] = [];
  const audio: AudioRendition[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const [width, height] = (attr(line, "RESOLUTION") ?? "0x0").split("x").map(Number);
      const bandwidth = Number(attr(line, "BANDWIDTH") ?? 0);
      const url = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
      if (url) variants.push({ url, width, height, bandwidth });
    } else if (line.startsWith("#EXT-X-MEDIA:") && attr(line, "TYPE") === "AUDIO") {
      const url = attr(line, "URI");
      if (url) audio.push({ url, name: attr(line, "NAME") ?? "" });
    }
  });
  return { variants, audio };
}

// Init segment + first media segment of a media playlist.
function firstSegments(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim());
  const init = lines.map((l) => (l.startsWith("#EXT-X-MAP:") ? attr(l, "URI") : undefined)).find(Boolean);
  const first = lines.find((l) => l && !l.startsWith("#"));
  return [init, first].filter((u): u is string => !!u);
}

async function buildSnapshot(): Promise<{ snapshot: StartupSnapshot; preloads: string[] }> {
  const snapshot: StartupSnapshot = { generatedAt: Date.now(), playlists: {}, startLevels: {} };
  const preloads: string[] = [];

  // Masters for every short (each ~4 KB), so swipes skip the cold origin too.
  const masters = await Promise.all(
    SHORTS_FEED.map(async (s) => {
      try {
        const text = await fetchText(masterUrl(s.id));
        snapshot.playlists[masterUrl(s.id)] = text;
        return text;
      } catch (err) {
        console.warn(`[fastpix-startup] master for ${s.id} failed:`, err);
        return null;
      }
    }),
  );

  // Variant + audio playlists and preloads for the first short only.
  const first = SHORTS_FEED[0];
  const firstMaster = masters[0];
  if (!first || !firstMaster) return { snapshot, preloads };
  const { variants, audio } = parseMaster(firstMaster);
  if (!variants.length) return { snapshot, preloads };

  // Mirror hls.js level sorting (height, then bitrate) to get the start index.
  const sorted = [...variants].sort((a, b) => a.height - b.height || a.bandwidth - b.bandwidth);
  const shortSide = (v: Variant) => Math.min(v.width, v.height);
  const start = sorted.find((v) => shortSide(v) >= START_SHORT_SIDE) ?? sorted[sorted.length - 1];
  snapshot.startLevels[first.id] = sorted.indexOf(start);

  // hls.js starts on the audio track the player selects ("default"), else 0.
  const startAudio = audio.find((a) => a.name.toLowerCase() === "default") ?? audio[0];

  await Promise.all(
    [start.url, ...(startAudio ? [startAudio.url] : [])].map(async (url) => {
      try {
        const text = await fetchText(url);
        snapshot.playlists[url] = text;
        preloads.push(...firstSegments(text));
      } catch (err) {
        console.warn("[fastpix-startup] media playlist failed:", err);
      }
    }),
  );
  return { snapshot, preloads };
}

export function fastpixStartup(): Plugin {
  let result: ReturnType<typeof buildSnapshot> | null = null;
  const getResult = () => (result ??= buildSnapshot());

  return {
    name: "fastpix-startup",
    buildStart() {
      void getResult();
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const { snapshot } = await getResult();
      return `export default ${JSON.stringify(snapshot)};`;
    },
    async transformIndexHtml() {
      const first = SHORTS_FEED[0];
      if (!first) return [];
      const { preloads } = await getResult();
      const tags: HtmlTagDescriptor[] = [
        {
          tag: "link",
          attrs: { rel: "preload", as: "image", href: posterUrl(first.id), fetchpriority: "high" },
          injectTo: "head",
        },
        // crossorigin="anonymous" matches hls.js's CORS XHR, so the browser
        // hands it these responses instead of downloading them again.
        ...preloads.map(
          (href): HtmlTagDescriptor => ({
            tag: "link",
            attrs: { rel: "preload", as: "fetch", crossorigin: "anonymous", href, fetchpriority: "high" },
            injectTo: "head",
          }),
        ),
      ];
      return tags;
    },
  };
}
